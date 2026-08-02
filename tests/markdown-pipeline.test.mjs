// Integration tests for the full preview pipeline: real markdown-it (the
// same package the app vendors) configured with the app's MD_OPTIONS,
// followed by the app's sanitizer — exactly what render() does in
// ui/renderer.js, minus Monaco.
import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';

import '../ui/preview-core.js';
const core = window.downerCore;

const md = new MarkdownIt(core.MD_OPTIONS);
const toAssetUrl = (p) => 'asset://' + p;

function renderPreview(source, baseDir = null) {
  const root = document.createElement('div');
  root.innerHTML = md.render(source);
  core.sanitize(root, baseDir, toAssetUrl);
  return root;
}

describe('markdown rendering', () => {
  it('renders headings, emphasis and lists', () => {
    const root = renderPreview('# Title\n\nSome *em* and **strong**.\n\n- one\n- two\n');
    expect(root.querySelector('h1').textContent).toBe('Title');
    expect(root.querySelector('em').textContent).toBe('em');
    expect(root.querySelector('strong').textContent).toBe('strong');
    expect(root.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders fenced code blocks without interpreting their content', () => {
    const root = renderPreview('```html\n<script>alert(1)</script>\n```\n');
    const code = root.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code.textContent).toContain('<script>alert(1)</script>');
    expect(root.querySelector('script')).toBeNull();
  });

  it('renders tables', () => {
    const root = renderPreview('| a | b |\n| - | - |\n| 1 | 2 |\n');
    expect(root.querySelector('table')).not.toBeNull();
    expect(root.querySelectorAll('td')).toHaveLength(2);
  });

  it('auto-links bare URLs (linkify)', () => {
    const root = renderPreview('see https://example.com/docs for more');
    const a = root.querySelector('a');
    expect(a.getAttribute('href')).toBe('https://example.com/docs');
  });

  it('applies typographic replacements', () => {
    const root = renderPreview('"quotes" and (c)');
    expect(root.textContent).toContain('\u201Cquotes\u201D');
    expect(root.textContent).toContain('©');
  });

  it('does not treat single newlines as hard breaks', () => {
    const root = renderPreview('line one\nline two');
    expect(root.querySelector('br')).toBeNull();
  });
});

describe('hostile markdown is neutralized', () => {
  it('strips raw <script> blocks', () => {
    const root = renderPreview('hello\n\n<script>window.pwned = 1;</script>\n');
    expect(root.querySelector('script')).toBeNull();
    expect(root.innerHTML).not.toContain('pwned');
  });

  it('strips inline event handlers from raw HTML', () => {
    const root = renderPreview('<img src="https://example.com/x.png" onerror="window.pwned=1">');
    const img = root.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.hasAttribute('onerror')).toBe(false);
  });

  it('leaves no javascript: URL in any attribute', () => {
    const source = [
      '[md link](javascript:alert(1))', // markdown-it itself refuses this link
      '<a href="javascript:alert(2)">raw</a>',
      '<img src="javascript:alert(3)">'
    ].join('\n\n');
    const root = renderPreview(source);
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        expect(attr.value.toLowerCase()).not.toContain('javascript:');
      }
    }
    expect(root.querySelector('a[href], img[src]')).toBeNull();
  });

  it('strips iframes, styles and forms embedded in markdown', () => {
    const source =
      '<iframe src="https://evil.example"></iframe>\n\n' +
      '<style>body{display:none}</style>\n\n' +
      '<form action="https://evil.example"><input name="x"></form>\n';
    const root = renderPreview(source);
    expect(root.querySelector('iframe, style, form')).toBeNull();
  });

  it('strips data:text/html image sources', () => {
    const root = renderPreview('<img src="data:text/html;base64,PHNjcmlwdD4=">');
    expect(root.querySelector('img').hasAttribute('src')).toBe(false);
  });
});

describe('local images in documents', () => {
  it('resolves ![](relative) images against the open file directory', () => {
    const root = renderPreview('![alt](images/pic.png)', 'C:\\docs\\notes');
    expect(root.querySelector('img').getAttribute('src'))
      .toBe('asset://C:/docs/notes/images/pic.png');
    expect(root.querySelector('img').getAttribute('alt')).toBe('alt');
  });

  it('leaves remote images alone', () => {
    const root = renderPreview('![alt](https://example.com/pic.png)', 'C:\\docs');
    expect(root.querySelector('img').getAttribute('src'))
      .toBe('https://example.com/pic.png');
  });

  it('does not rewrite relative images for an unsaved buffer', () => {
    const root = renderPreview('![alt](images/pic.png)', null);
    expect(root.querySelector('img').getAttribute('src')).toBe('images/pic.png');
  });
});
