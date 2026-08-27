'use strict';

/* ------------------------------------------------------------------ *
 * downer HTML export: turns the rendered preview into a standalone    *
 * .html document. Pure helpers only — no Tauri, Monaco, or boot-time  *
 * DOM dependencies — so the test suite can exercise all of it under   *
 * Node (jsdom). Loaded as a classic <script>; exposes                 *
 * window.downerExport. Depends on window.downerCore (looked up when   *
 * called, so script order between the two files doesn't matter).      *
 * ------------------------------------------------------------------ */

(function (global) {
  // Styles for the exported file. Deliberately a self-contained copy of
  // the preview look from ui/styles.css rather than a reference to it:
  // the export has to render in any browser, with no downer around.
  const EXPORT_CSS = `
:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --rule: #d0d7de;
  --link: #0969da;
  --quote: #6e7781;
  --tint: rgba(129, 139, 152, 0.15);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --rule: #30363d;
    --link: #4493f8;
    --quote: #8b949e;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
    Helvetica, Arial, sans-serif;
}
.markdown-body {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 44px 96px;
  font-size: 16px;
  line-height: 1.6;
  word-wrap: break-word;
}
.markdown-body > *:first-child { margin-top: 0; }
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin: 24px 0 16px;
  font-weight: 600;
  line-height: 1.25;
}
.markdown-body h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--rule); }
.markdown-body h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid var(--rule); }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: .875em; }
.markdown-body h6 { font-size: .85em; color: var(--quote); }
.markdown-body p,
.markdown-body blockquote,
.markdown-body ul,
.markdown-body ol,
.markdown-body table,
.markdown-body pre { margin: 0 0 16px; }
.markdown-body a { color: var(--link); text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body ul, .markdown-body ol { padding-left: 2em; }
.markdown-body li + li { margin-top: .25em; }
.markdown-body li > ul, .markdown-body li > ol { margin: .25em 0 0; }
.markdown-body blockquote {
  padding: 0 1em;
  color: var(--quote);
  border-left: .25em solid var(--rule);
}
.markdown-body code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas,
    "Liberation Mono", Menlo, monospace;
  font-size: 85%;
  padding: .2em .4em;
  border-radius: 6px;
  background: var(--tint);
}
.markdown-body pre {
  padding: 16px;
  overflow: auto;
  border-radius: 8px;
  font-size: 85%;
  line-height: 1.45;
  background: var(--tint);
}
.markdown-body pre code { padding: 0; background: none; font-size: 100%; }
.markdown-body table { border-collapse: collapse; display: block; overflow: auto; }
.markdown-body th, .markdown-body td { padding: 6px 13px; border: 1px solid var(--rule); }
.markdown-body tr:nth-child(2n) { background: rgba(129, 139, 152, 0.08); }
.markdown-body table th { font-weight: 600; }
.markdown-body img { max-width: 100%; }
.markdown-body hr { height: 1px; border: 0; margin: 24px 0; background: var(--rule); }
@media print {
  :root { --bg: #ffffff; --fg: #1f2328; }
  .markdown-body { max-width: none; padding: 0; }
}
`.trim();

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // "C:\docs\notes.md" -> "notes"; untitled buffers -> "Untitled".
  function docTitle(path) {
    const name = global.downerCore.baseName(path);
    return name.replace(/\.[^.]+$/, '') || name;
  }

  // Default file name offered in the Save As HTML dialog.
  function htmlFileName(path) {
    return path ? `${docTitle(path)}.html` : 'untitled.html';
  }

  // Where the Save As HTML dialog should open: next to the markdown file,
  // which is also where relative image paths in the export line up best.
  // An untitled buffer has no directory, so offer a bare name.
  function defaultExportPath(mdPath) {
    if (!mdPath) return htmlFileName(null);
    const sep = mdPath.includes('\\') ? '\\' : '/';
    return global.downerCore.dirOf(mdPath) + sep + htmlFileName(mdPath);
  }

  // The dialog may hand back a path without an extension (the user typed
  // a bare name); make sure what lands on disk is actually an .html file.
  function ensureHtmlExt(path) {
    return /\.html?$/i.test(path) ? path : `${path}.html`;
  }

  // ---- relative paths for images -------------------------------------
  // Path comparison is case-insensitive: downer is a Windows app first,
  // and "Images/" and "images/" name the same directory there.
  function rootKind(p) {
    const u = String(p).replace(/\\/g, '/');
    if (u.startsWith('//')) return 'unc';
    if (/^[a-zA-Z]:\//.test(u)) return 'drive';
    if (u.startsWith('/')) return 'abs';
    return 'rel';
  }

  function segments(p) {
    return String(p)
      .replace(/\\/g, '/')
      .split('/')
      .filter((s) => s !== '' && s !== '.');
  }

  // Relative path from a directory to a file, or null when the two live
  // on different roots (another drive, a network share) and no relative
  // path can connect them.
  function relativePath(fromDir, toPath) {
    const kind = rootKind(fromDir);
    if (kind === 'rel' || rootKind(toPath) !== kind) return null;

    const from = segments(fromDir);
    const to = segments(toPath);
    if (!from.length || !to.length) return null;
    if (from[0].toLowerCase() !== to[0].toLowerCase()) return null;

    let i = 0;
    while (i < from.length && i < to.length &&
           from[i].toLowerCase() === to[i].toLowerCase()) i++;

    return [...from.slice(i).map(() => '..'), ...to.slice(i)].join('/');
  }

  // Percent-encode each segment: file names may contain spaces, '#', '?'.
  // '..' survives encodeURIComponent unchanged.
  function encodeRelative(rel) {
    return rel.split('/').map((s) => encodeURIComponent(s)).join('/');
  }

  // The src an exported <img> should carry, or null to leave it alone
  // (remote URLs, data: images, and relative paths in an untitled buffer
  // all pass through untouched). Local images become relative to the
  // exported file so the HTML keeps working next to its images; a file://
  // URL is the fallback when nothing relative can reach them.
  function exportImageSrc(raw, baseDir, outDir) {
    const abs = global.downerCore.resolveLocalPath(raw, baseDir);
    if (!abs) return null;
    const rel = outDir ? relativePath(outDir, abs) : null;
    return rel ? encodeRelative(rel) : global.downerCore.pathToFileUrl(abs);
  }

  function rewriteImagesForExport(root, baseDir, outDir) {
    for (const img of root.querySelectorAll('img')) {
      const next = exportImageSrc((img.getAttribute('src') || '').trim(), baseDir, outDir);
      if (next) img.setAttribute('src', next);
    }
  }

  // ---- the document --------------------------------------------------
  function buildHtmlDocument(title, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="downer">
<title>${escapeHtml(title)}</title>
<style>
${EXPORT_CSS}
</style>
</head>
<body>
<article class="markdown-body">
${body}
</article>
</body>
</html>
`;
  }

  global.downerExport = {
    EXPORT_CSS,
    escapeHtml,
    docTitle,
    htmlFileName,
    defaultExportPath,
    ensureHtmlExt,
    relativePath,
    encodeRelative,
    exportImageSrc,
    rewriteImagesForExport,
    buildHtmlDocument
  };
})(typeof window !== 'undefined' ? window : globalThis);
