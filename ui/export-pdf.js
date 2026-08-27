'use strict';

/* ------------------------------------------------------------------ *
 * downer PDF export: there is no PDF writer in the app — the rendered *
 * document is handed to the system print dialog, where "Microsoft     *
 * Print to PDF" (or any other PDF printer) writes the file. The page  *
 * printed is the HTML export, so print and export stay in step.       *
 * Pure helpers plus one DOM routine whose collaborators are injected, *
 * so the test suite can exercise all of it under Node (jsdom).        *
 * Loaded as a classic <script>; exposes window.downerPdf. Depends on  *
 * window.downerExport (looked up when called, so script order between *
 * the two files doesn't matter).                                      *
 * ------------------------------------------------------------------ */

(function (global) {
  // Layered on top of the HTML export's stylesheet (see buildHtmlDocument),
  // so these rules win by coming last. Paper has no scrollbars, no dark
  // mode and hard page boundaries, which is what this fixes up.
  const PRINT_CSS = `
@page { margin: 18mm 16mm; }
/* Paper is white whatever the OS theme says. */
:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --rule: #d0d7de;
  --link: #0969da;
  --quote: #6e7781;
  --tint: rgba(129, 139, 152, 0.15);
}
.markdown-body { max-width: none; padding: 0; font-size: 11pt; }
/* Don't strand a heading at the foot of a page. */
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 { break-after: avoid-page; }
/* Keep code blocks, quotes, tables and images whole where they fit. */
.markdown-body pre,
.markdown-body blockquote,
.markdown-body table,
.markdown-body img { break-inside: avoid; }
/* Code lines are clipped on paper, not scrollable: wrap them instead. */
.markdown-body pre { overflow: visible; white-space: pre-wrap; word-break: break-word; }
.markdown-body table { display: table; width: 100%; }
.markdown-body thead { display: table-header-group; }
`.trim();

  // How long the print frame sticks around after print() returns. WebView2
  // holds the dialog open while the frame is alive; removing it the instant
  // print() returns can cut the job short, and a stale hidden frame per
  // print would leak, so drop it shortly after.
  const CLEANUP_MS = 1000;

  // If the frame never loads (it always has, but a hung load would leave the
  // caller waiting forever), give up and report failure instead.
  const TIMEOUT_MS = 15000;

  // The document to print: the HTML export plus the print rules above.
  function buildPrintDocument(title, body) {
    return global.downerExport.buildHtmlDocument(title, body, PRINT_CSS);
  }

  // Offscreen, not display:none — a hidden frame has no layout, so there
  // would be nothing to paginate. aria-hidden keeps it off the a11y tree.
  function createPrintFrame(doc) {
    const frame = doc.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('title', 'Print preview');
    frame.style.cssText =
      'position:fixed; left:-10000px; top:0; width:210mm; height:297mm; border:0;';
    return frame;
  }

  // Print a standalone HTML document without disturbing the app window:
  // the document goes into an offscreen frame and that frame is printed,
  // so the toolbar, editor and status bar stay off the page. Resolves true
  // once the dialog has been handed the document (whether the user then
  // saves a PDF or cancels is between them and Windows), false if the
  // frame never got there.
  //
  // deps.document / deps.print exist for the test suite; the app calls this
  // with no deps at all.
  function printHtmlDocument(html, deps) {
    const opts = deps || {};
    const doc = opts.document || global.document;
    const print = opts.print || ((win) => win.print());
    const cleanupMs = opts.cleanupMs === undefined ? CLEANUP_MS : opts.cleanupMs;
    const timeoutMs = opts.timeoutMs === undefined ? TIMEOUT_MS : opts.timeoutMs;

    return new Promise((resolve) => {
      const frame = createPrintFrame(doc);
      let settled = false;

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        setTimeout(() => frame.remove(), cleanupMs);
        resolve(ok);
      };

      frame.addEventListener('load', () => {
        const win = frame.contentWindow;
        if (!win) return finish(false);
        try {
          print(win);
          finish(true);
        } catch (e) {
          finish(false);
        }
      });

      setTimeout(() => finish(false), timeoutMs);

      // srcdoc before the frame is in the document: the injected markup is
      // then the frame's first load, so the load above can't fire early on
      // an empty initial document.
      frame.srcdoc = html;
      doc.body.appendChild(frame);
    });
  }

  global.downerPdf = {
    PRINT_CSS,
    buildPrintDocument,
    createPrintFrame,
    printHtmlDocument
  };
})(typeof window !== 'undefined' ? window : globalThis);
