// Unit + integration tests for ui/export-html.js — the Save As HTML path.
// The exported file leaves the app, so two things matter here: it must be
// a valid standalone document, and it must carry no more script surface
// than the sanitized preview does.
import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';

import '../ui/preview-core.js';
import '../ui/export-html.js';
const core = window.downerCore;
const xp = window.downerExport;

const md = new MarkdownIt(core.MD_OPTIONS);

// What ui/renderer.js buildExport() does, minus Monaco.
function exportDocument(source, mdPath, outPath) {
  const root = document.createElement('div');
  root.innerHTML = md.render(source);
  core.sanitize(root, null, null);
  xp.rewriteImagesForExport(
    root,
    mdPath ? core.dirOf(mdPath) : null,
    core.dirOf(outPath)
  );
  return xp.buildHtmlDocument(xp.docTitle(mdPath), root.innerHTML);
}

describe('docTitle', () => {
  it('drops the extension', () => {
    expect(xp.docTitle('C:\\docs\\release notes.md')).toBe('release notes');
  });

  it('falls back to Untitled for a fresh buffer', () => {
    expect(xp.docTitle(null)).toBe('Untitled');
  });

  it('keeps dotfile names intact', () => {
    expect(xp.docTitle('C:\\docs\\.gitignore')).toBe('.gitignore');
  });
});

describe('htmlFileName', () => {
  it('swaps the markdown extension for .html', () => {
    expect(xp.htmlFileName('C:\\docs\\notes.md')).toBe('notes.html');
    expect(xp.htmlFileName('C:/docs/README.markdown')).toBe('README.html');
  });

  it('offers untitled.html for a fresh buffer', () => {
    expect(xp.htmlFileName(null)).toBe('untitled.html');
  });
});

describe('defaultExportPath', () => {
  it('lands beside the markdown file, keeping its separator', () => {
    expect(xp.defaultExportPath('C:\\docs\\notes.md')).toBe('C:\\docs\\notes.html');
    expect(xp.defaultExportPath('C:/docs/notes.md')).toBe('C:/docs/notes.html');
  });

  it('offers a bare name for a fresh buffer', () => {
    expect(xp.defaultExportPath(null)).toBe('untitled.html');
  });
});

describe('ensureHtmlExt', () => {
  it('appends .html when the dialog returns a bare name', () => {
    expect(xp.ensureHtmlExt('C:\\docs\\notes')).toBe('C:\\docs\\notes.html');
  });

  it('leaves .html and .htm alone, any case', () => {
    expect(xp.ensureHtmlExt('a.html')).toBe('a.html');
    expect(xp.ensureHtmlExt('a.htm')).toBe('a.htm');
    expect(xp.ensureHtmlExt('a.HTML')).toBe('a.HTML');
  });

  it('does not mistake another extension for html', () => {
    expect(xp.ensureHtmlExt('notes.md')).toBe('notes.md.html');
  });
});

describe('relativePath', () => {
  it('finds a path down into a subdirectory', () => {
    expect(xp.relativePath('C:\\docs', 'C:\\docs\\images\\pic.png'))
      .toBe('images/pic.png');
  });

  it('climbs out with ../ segments', () => {
    expect(xp.relativePath('C:\\out', 'C:\\docs\\images\\pic.png'))
      .toBe('../docs/images/pic.png');
  });

  it('ignores case, the way Windows does', () => {
    expect(xp.relativePath('C:\\Docs', 'c:\\docs\\pic.png')).toBe('pic.png');
  });

  it('accepts either separator', () => {
    expect(xp.relativePath('C:/docs', 'C:\\docs\\pic.png')).toBe('pic.png');
  });

  it('returns null across drives', () => {
    expect(xp.relativePath('C:\\out', 'D:\\pics\\a.png')).toBeNull();
  });

  it('returns null between a drive and a network share', () => {
    expect(xp.relativePath('C:\\out', '\\\\server\\share\\a.png')).toBeNull();
    expect(xp.relativePath('\\\\server\\share', 'C:\\pics\\a.png')).toBeNull();
  });

  it('relates two paths on the same share', () => {
    expect(xp.relativePath('\\\\server\\share\\out', '\\\\server\\share\\pic.png'))
      .toBe('../pic.png');
  });

  it('returns null when either side is relative', () => {
    expect(xp.relativePath('docs', 'C:\\docs\\a.png')).toBeNull();
  });
});

describe('encodeRelative', () => {
  it('escapes spaces and URL-significant characters per segment', () => {
    expect(xp.encodeRelative('my images/a b#1?.png'))
      .toBe('my%20images/a%20b%231%3F.png');
  });

  it('leaves ../ segments walkable', () => {
    expect(xp.encodeRelative('../a/b.png')).toBe('../a/b.png');
  });
});

describe('exportImageSrc', () => {
  const mdDir = 'C:\\docs';

  it('rewrites a local image relative to the exported file', () => {
    expect(xp.exportImageSrc('images/pic.png', mdDir, 'C:\\docs'))
      .toBe('images/pic.png');
    expect(xp.exportImageSrc('images/pic.png', mdDir, 'C:\\out'))
      .toBe('../docs/images/pic.png');
  });

  it('falls back to a file:// URL across drives', () => {
    expect(xp.exportImageSrc('images/pic.png', mdDir, 'D:\\out'))
      .toBe('file:///C:/docs/images/pic.png');
  });

  it('leaves remote and data: sources alone', () => {
    expect(xp.exportImageSrc('https://example.com/a.png', mdDir, 'C:\\out')).toBeNull();
    expect(xp.exportImageSrc('data:image/png;base64,AAAA', mdDir, 'C:\\out')).toBeNull();
  });

  it('leaves relative sources alone when the buffer is untitled', () => {
    expect(xp.exportImageSrc('images/pic.png', null, 'C:\\out')).toBeNull();
  });
});

describe('rewriteImagesForExport', () => {
  function rewritten(html, mdDir, outDir) {
    const root = document.createElement('div');
    root.innerHTML = html;
    xp.rewriteImagesForExport(root, mdDir, outDir);
    return root;
  }

  it('rewrites local images and keeps remote ones', () => {
    const root = rewritten(
      '<img src="images/a.png"><img src="https://example.com/b.png">',
      'C:\\docs',
      'C:\\out'
    );
    const imgs = root.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('../docs/images/a.png');
    expect(imgs[1].getAttribute('src')).toBe('https://example.com/b.png');
  });

  it('never emits an asset:// URL — those only resolve inside the app', () => {
    const root = rewritten('<img src="images/a.png">', 'C:\\docs', 'C:\\docs');
    expect(root.innerHTML).not.toContain('asset:');
  });
});

describe('buildHtmlDocument', () => {
  it('produces a standalone document with the body inlined', () => {
    const doc = xp.buildHtmlDocument('notes', '<h1>Hi</h1>');
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain('<title>notes</title>');
    expect(doc).toContain('<h1>Hi</h1>');
    expect(doc.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('inlines the stylesheet so the file needs no companions', () => {
    const doc = xp.buildHtmlDocument('notes', '');
    expect(doc).toContain('.markdown-body');
    expect(doc).not.toContain('<link');
  });

  it('escapes the title', () => {
    const doc = xp.buildHtmlDocument('a <script> & "quoted"', '');
    expect(doc).toContain('<title>a &lt;script&gt; &amp; &quot;quoted&quot;</title>');
    expect(doc).not.toContain('<title>a <script>');
  });
});

describe('exported document (end to end)', () => {
  const out = 'C:\\docs\\notes.html';

  it('carries the rendered markdown', () => {
    const doc = exportDocument('# Title\n\n- one\n- two\n', 'C:\\docs\\notes.md', out);
    expect(doc).toContain('<h1>Title</h1>');
    expect(doc).toContain('<li>two</li>');
    expect(doc).toContain('<title>notes</title>');
  });

  it('drops scripts, inline handlers and javascript: links', () => {
    const doc = exportDocument(
      '<script>window.pwned=1</script>\n\n<img src="x.png" onerror="pwn()">\n\n' +
      '<a href="javascript:alert(1)">x</a>\n',
      'C:\\docs\\notes.md',
      out
    );
    expect(doc).not.toContain('pwned');
    expect(doc).not.toContain('onerror');
    expect(doc).not.toContain('href="javascript:');
    expect(doc).toContain('>x</a>');   // the link survives, its href does not
  });

  it('keeps fenced code readable rather than executable', () => {
    const doc = exportDocument('```html\n<script>alert(1)</script>\n```\n', null, out);
    expect(doc).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('points images at the markdown file, from the export directory', () => {
    const doc = exportDocument('![](images/pic.png)\n', 'C:\\docs\\notes.md', 'C:\\out\\notes.html');
    expect(doc).toContain('src="../docs/images/pic.png"');
  });
});
