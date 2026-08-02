// Unit tests for ui/preview-core.js: path helpers and the HTML sanitizer.
// The sanitizer is the app's XSS barrier — markdown-it runs with html:true,
// so everything hostile a .md file can contain must be neutralized here.
import { describe, it, expect } from 'vitest';

import '../ui/preview-core.js';
const core = window.downerCore;

const toAssetUrl = (p) => 'asset://' + p;

function sanitized(html, baseDir = null) {
  const root = document.createElement('div');
  root.innerHTML = html;
  core.sanitize(root, baseDir, toAssetUrl);
  return root;
}

describe('baseName', () => {
  it('returns the file name of a Windows path', () => {
    expect(core.baseName('C:\\docs\\notes\\todo.md')).toBe('todo.md');
  });

  it('handles forward slashes', () => {
    expect(core.baseName('C:/docs/todo.md')).toBe('todo.md');
  });

  it('ignores trailing separators', () => {
    expect(core.baseName('C:\\docs\\notes\\')).toBe('notes');
  });

  it('returns Untitled for empty/null paths', () => {
    expect(core.baseName(null)).toBe('Untitled');
    expect(core.baseName('')).toBe('Untitled');
  });
});

describe('dirOf', () => {
  it('returns the directory of a Windows path', () => {
    expect(core.dirOf('C:\\docs\\notes\\todo.md')).toBe('C:\\docs\\notes');
  });

  it('handles forward slashes', () => {
    expect(core.dirOf('C:/docs/todo.md')).toBe('C:/docs');
  });
});

describe('pathToFileUrl / fileUrlToPath', () => {
  it('converts a Windows path to a file URL', () => {
    expect(core.pathToFileUrl('C:\\docs\\a.md')).toBe('file:///C:/docs/a.md');
  });

  it('round-trips a path with spaces', () => {
    const url = core.pathToFileUrl('C:\\my docs\\a file.md');
    expect(url).toBe('file:///C:/my%20docs/a%20file.md');
    expect(core.fileUrlToPath(url)).toBe('C:/my docs/a file.md');
  });

  it('round-trips a UNC-style path', () => {
    const url = core.pathToFileUrl('\\\\server\\share\\a.md');
    expect(core.fileUrlToPath(url)).toBe('//server/share/a.md');
  });
});

describe('resolveLocalPath', () => {
  const base = 'C:\\docs\\notes';

  it('resolves a relative path against the base directory', () => {
    expect(core.resolveLocalPath('images/pic.png', base))
      .toBe('C:/docs/notes/images/pic.png');
  });

  it('resolves ../ segments', () => {
    expect(core.resolveLocalPath('../shared/pic.png', base))
      .toBe('C:/docs/shared/pic.png');
  });

  it('keeps percent-decoded characters and spaces', () => {
    expect(core.resolveLocalPath('img/my pic.png', base))
      .toBe('C:/docs/notes/img/my pic.png');
  });

  it('returns absolute Windows paths unchanged', () => {
    expect(core.resolveLocalPath('C:\\pics\\a.png', base)).toBe('C:\\pics\\a.png');
    expect(core.resolveLocalPath('D:/pics/a.png', base)).toBe('D:/pics/a.png');
  });

  it('leaves URLs with a scheme alone', () => {
    for (const v of [
      'http://example.com/a.png',
      'https://example.com/a.png',
      'data:image/png;base64,AAAA',
      'asset://localhost/C%3A/a.png',
      'blob:null/abc'
    ]) {
      expect(core.resolveLocalPath(v, base)).toBeNull();
    }
  });

  it('leaves protocol-relative URLs and anchors alone', () => {
    expect(core.resolveLocalPath('//cdn.example.com/a.png', base)).toBeNull();
    expect(core.resolveLocalPath('#section', base)).toBeNull();
  });

  it('returns null for relative paths in an untitled buffer', () => {
    expect(core.resolveLocalPath('images/pic.png', null)).toBeNull();
  });

  it('returns null for empty values', () => {
    expect(core.resolveLocalPath('', base)).toBeNull();
    expect(core.resolveLocalPath(null, base)).toBeNull();
  });
});

describe('sanitize: blocked elements', () => {
  it.each([...core.BLOCKED_TAGS])('removes <%s> elements', (tag) => {
    const root = sanitized(`<p>before</p><${tag}></${tag}><p>after</p>`);
    expect(root.querySelector(tag)).toBeNull();
    expect(root.textContent).toContain('before');
    expect(root.textContent).toContain('after');
  });

  it('removes <script> including its content', () => {
    const root = sanitized('<p>ok</p><script>window.pwned = true;</script>');
    expect(root.querySelector('script')).toBeNull();
    expect(root.innerHTML).not.toContain('pwned');
  });

  it('removes nested blocked elements', () => {
    const root = sanitized('<div><span><iframe src="https://evil.example"></iframe></span></div>');
    expect(root.querySelector('iframe')).toBeNull();
  });
});

describe('sanitize: event handler attributes', () => {
  it('strips onerror from images', () => {
    const root = sanitized('<img src="http://example.com/x.png" onerror="window.pwned=1">');
    expect(root.querySelector('img').hasAttribute('onerror')).toBe(false);
  });

  it('strips any on* attribute regardless of case', () => {
    const root = sanitized('<div onclick="1" onMouseOver="2" ONLOAD="3">x</div>');
    const div = root.querySelector('div');
    expect(div.attributes.length).toBe(0);
  });

  it('keeps harmless attributes', () => {
    const root = sanitized('<p title="hint" class="note">x</p>');
    const p = root.querySelector('p');
    expect(p.getAttribute('title')).toBe('hint');
    expect(p.getAttribute('class')).toBe('note');
  });
});

describe('sanitize: dangerous URLs', () => {
  it('strips javascript: hrefs', () => {
    const root = sanitized('<a href="javascript:alert(1)">x</a>');
    expect(root.querySelector('a').hasAttribute('href')).toBe(false);
  });

  it('strips javascript: hrefs with mixed case and padding', () => {
    const root = sanitized('<a href="  JaVaScRiPt:alert(1)">x</a>');
    expect(root.querySelector('a').hasAttribute('href')).toBe(false);
  });

  it('strips javascript: hrefs written with HTML entities', () => {
    // The parser decodes &#58; to ":" before sanitize sees the value.
    const root = sanitized('<a href="javascript&#58;alert(1)">x</a>');
    expect(root.querySelector('a').hasAttribute('href')).toBe(false);
  });

  it('strips vbscript: URLs', () => {
    const root = sanitized('<a href="vbscript:msgbox(1)">x</a>');
    expect(root.querySelector('a').hasAttribute('href')).toBe(false);
  });

  it('strips non-image data: sources', () => {
    const root = sanitized('<img src="data:text/html;base64,PHNjcmlwdD4=">');
    expect(root.querySelector('img').hasAttribute('src')).toBe(false);
  });

  it('keeps data:image sources', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    const root = sanitized(`<img src="${src}">`);
    expect(root.querySelector('img').getAttribute('src')).toBe(src);
  });

  it('keeps normal http(s) and mailto links', () => {
    const root = sanitized(
      '<a href="https://example.com">a</a><a href="mailto:x@example.com">b</a>'
    );
    const links = root.querySelectorAll('a');
    expect(links[0].getAttribute('href')).toBe('https://example.com');
    expect(links[1].getAttribute('href')).toBe('mailto:x@example.com');
  });
});

describe('sanitize: local image resolution', () => {
  const base = 'C:\\docs\\notes';

  it('rewrites relative image paths to asset URLs', () => {
    const root = sanitized('<img src="images/pic.png">', base);
    expect(root.querySelector('img').getAttribute('src'))
      .toBe('asset://C:/docs/notes/images/pic.png');
  });

  it('rewrites absolute Windows image paths to asset URLs', () => {
    const root = sanitized('<img src="C:\\pics\\a.png">', base);
    expect(root.querySelector('img').getAttribute('src'))
      .toBe('asset://C:\\pics\\a.png');
  });

  it('leaves remote images untouched', () => {
    const root = sanitized('<img src="https://example.com/a.png">', base);
    expect(root.querySelector('img').getAttribute('src'))
      .toBe('https://example.com/a.png');
  });

  it('leaves relative images untouched in an untitled buffer', () => {
    const root = sanitized('<img src="images/pic.png">', null);
    expect(root.querySelector('img').getAttribute('src')).toBe('images/pic.png');
  });
});
