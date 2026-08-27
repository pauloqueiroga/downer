// Unit + integration tests for ui/export-pdf.js — the Save As PDF path.
// Nothing here can open a real print dialog, so the tests cover what we
// control: the document that gets printed, and the offscreen frame that
// carries it (with the print call itself injected).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import MarkdownIt from 'markdown-it';

import '../ui/preview-core.js';
import '../ui/export-html.js';
import '../ui/export-pdf.js';
const core = window.downerCore;
const xp = window.downerExport;
const pdf = window.downerPdf;

const md = new MarkdownIt(core.MD_OPTIONS);

// What ui/renderer.js buildPrintable() does, minus Monaco. Note the
// asset: rewriting: the page is printed from inside the app.
const toAssetUrl = (p) => `asset://localhost/${encodeURIComponent(p)}`;

function printDocument(source, mdPath) {
  const root = document.createElement('div');
  root.innerHTML = md.render(source);
  core.sanitize(root, mdPath ? core.dirOf(mdPath) : null, toAssetUrl);
  return pdf.buildPrintDocument(xp.docTitle(mdPath), root.innerHTML);
}

describe('PRINT_CSS', () => {
  it('sets a page margin — the print dialog is the only other place to', () => {
    expect(pdf.PRINT_CSS).toContain('@page');
  });

  it('keeps code blocks off the page seam and wraps them instead of clipping', () => {
    expect(pdf.PRINT_CSS).toMatch(/break-inside:\s*avoid/);
    expect(pdf.PRINT_CSS).toMatch(/white-space:\s*pre-wrap/);
  });
});

describe('buildPrintDocument', () => {
  it('is the HTML export document, with the print rules appended', () => {
    const doc = pdf.buildPrintDocument('notes', '<h1>Hi</h1>');
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<title>notes</title>');
    expect(doc).toContain('<h1>Hi</h1>');
    expect(doc).toContain(xp.EXPORT_CSS);
    expect(doc).toContain(pdf.PRINT_CSS);
  });

  it('puts the print rules last, so they win over the export stylesheet', () => {
    const doc = pdf.buildPrintDocument('notes', '');
    expect(doc.indexOf(pdf.PRINT_CSS)).toBeGreaterThan(doc.indexOf(xp.EXPORT_CSS));
    // Specifically: paper stays white even when Windows is in dark mode.
    expect(doc.indexOf('prefers-color-scheme: dark'))
      .toBeLessThan(doc.indexOf('@page'));
  });

  it('escapes the title, which becomes the suggested PDF file name', () => {
    const doc = pdf.buildPrintDocument('a <script> & "quoted"', '');
    expect(doc).toContain('<title>a &lt;script&gt; &amp; &quot;quoted&quot;</title>');
  });
});

describe('createPrintFrame', () => {
  it('is offscreen but laid out — a display:none frame has no pages', () => {
    const frame = pdf.createPrintFrame(document);
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.style.display).not.toBe('none');
    expect(frame.style.position).toBe('fixed');
    expect(parseInt(frame.style.left, 10)).toBeLessThan(-1000);
  });

  it('stays out of the accessibility tree and the tab order', () => {
    const frame = pdf.createPrintFrame(document);
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.getAttribute('tabindex')).toBe('-1');
  });
});

describe('printHtmlDocument', () => {
  const html = '<!DOCTYPE html><html><body><article class="markdown-body">Hi</article></body></html>';

  // A document whose body swallows the frame: it never loads, so the
  // timeout is the only way out.
  const deadDocument = {
    createElement: (tag) => document.createElement(tag),
    body: { appendChild() {} }
  };

  // Cleanup runs on a timer, so a frame from the previous case can still
  // be around when the next one starts counting.
  beforeEach(() => {
    for (const frame of document.querySelectorAll('iframe')) frame.remove();
  });

  it('prints the frame holding the document', async () => {
    let printedFrom = null;
    const print = vi.fn((win) => {
      printedFrom = win.frameElement ? win.frameElement.getAttribute('srcdoc') : null;
    });

    const ok = await pdf.printHtmlDocument(html, { print, cleanupMs: 0 });
    expect(ok).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
    expect(printedFrom).toBe(html);
  });

  it('takes the frame back down afterwards', async () => {
    let framesWhilePrinting = 0;
    await pdf.printHtmlDocument(html, {
      print: () => { framesWhilePrinting = document.querySelectorAll('iframe').length; },
      cleanupMs: 1
    });
    expect(framesWhilePrinting).toBe(1);   // the page needs the frame to print
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelectorAll('iframe').length).toBe(0);
  });

  it('reports failure when printing throws, and still cleans up', async () => {
    const ok = await pdf.printHtmlDocument(html, {
      print: () => { throw new Error('no printer'); },
      cleanupMs: 1
    });
    expect(ok).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelectorAll('iframe').length).toBe(0);
  });

  it('gives up rather than hanging when the frame never loads', async () => {
    const print = vi.fn();
    const ok = await pdf.printHtmlDocument(html, {
      document: deadDocument,
      print,
      timeoutMs: 10,
      cleanupMs: 0
    });
    expect(ok).toBe(false);
    expect(print).not.toHaveBeenCalled();
  });
});

describe('printed document (end to end)', () => {
  it('carries the rendered markdown', () => {
    const doc = printDocument('# Title\n\n- one\n- two\n', 'C:\\docs\\notes.md');
    expect(doc).toContain('<h1>Title</h1>');
    expect(doc).toContain('<li>two</li>');
    expect(doc).toContain('<title>notes</title>');
  });

  it('points local images at the asset protocol so they print', () => {
    const doc = printDocument('![](images/pic.png)\n', 'C:\\docs\\notes.md');
    expect(doc).toContain('asset://localhost/');
    expect(doc).not.toContain('src="images/pic.png"');
  });

  it('leaves remote images alone', () => {
    const doc = printDocument('![](https://example.com/a.png)\n', 'C:\\docs\\notes.md');
    expect(doc).toContain('src="https://example.com/a.png"');
  });

  // The frame runs inside the app, on the app's origin: an untrusted .md
  // must not get a script in there.
  it('drops scripts, inline handlers and javascript: links', () => {
    const doc = printDocument(
      '<script>window.pwned=1</script>\n\n<img src="x.png" onerror="pwn()">\n\n' +
      '<a href="javascript:alert(1)">x</a>\n',
      'C:\\docs\\notes.md'
    );
    expect(doc).not.toContain('pwned');
    expect(doc).not.toContain('onerror');
    expect(doc).not.toContain('href="javascript:');
  });
});
