'use strict';

/* ------------------------------------------------------------------ *
 * downer preview core: pure helpers shared by the renderer and the    *
 * test suite. No Tauri, Monaco, or boot-time DOM dependencies here —  *
 * everything is a plain function so it also runs under Node (jsdom).  *
 * Loaded as a classic <script>; exposes a single window.downerCore.   *
 * ------------------------------------------------------------------ */

(function (global) {
  // Options for window.markdownit(...) — kept here so tests render with
  // exactly the configuration the app uses.
  const MD_OPTIONS = {
    html: true,        // allow inline HTML (output is sanitized below)
    linkify: true,     // auto-link bare URLs
    typographer: true, // smart quotes / dashes
    breaks: false
  };

  function baseName(p) {
    if (!p) return 'Untitled';
    return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  }

  function dirOf(p) {
    return p.replace(/[\\/][^\\/]*$/, '');
  }

  // ---- resolve relative image paths against the open file's directory -
  // markdown like `![](images/x.png)` is relative to the file on disk; turn
  // it into an absolute path the WebView can be allowed to load.
  function pathToFileUrl(p) {
    let u = p.replace(/\\/g, '/');
    if (/^[a-zA-Z]:/.test(u)) u = '/' + u; // C:/... -> /C:/...
    return 'file://' + encodeURI(u);
  }

  function fileUrlToPath(u) {
    let s = decodeURIComponent(u.replace(/^file:\/\//, ''));
    if (/^\/[a-zA-Z]:/.test(s)) s = s.slice(1); // /C:/a -> C:/a
    return s;
  }

  function resolveLocalPath(value, baseDir) {
    if (!value) return null;
    if (/^[a-zA-Z]:[\\/]/.test(value)) return value;       // already a Windows absolute path
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;    // already has a scheme (http/data/asset/blob/...)
    if (value.startsWith('//') || value.startsWith('#')) return null;
    if (!baseDir) return null;                              // untitled buffer: nothing to resolve against
    try {
      return fileUrlToPath(new URL(value, pathToFileUrl(baseDir) + '/').href);
    } catch { return null; }
  }

  // ---- sanitize rendered HTML before it touches the DOM --------------
  // innerHTML never executes <script>, but it DOES fire inline handlers
  // (e.g. <img onerror>) and follow javascript: URLs, so strip those.
  const BLOCKED_TAGS = new Set([
    'script', 'iframe', 'object', 'embed', 'form', 'meta', 'base', 'link', 'style'
  ]);

  // `toAssetUrl` converts an absolute filesystem path into a URL the
  // WebView may load (window.api.toAssetUrl in the app).
  function sanitize(root, baseDir, toAssetUrl) {
    const elements = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      elements.push(node);
      node = walker.nextNode();
    }
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      if (BLOCKED_TAGS.has(tag)) {
        el.remove();
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const raw = attr.value.trim();
        const value = raw.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === 'href' || name === 'src' || name === 'xlink:href') {
          if (value.startsWith('javascript:') || value.startsWith('vbscript:')) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (name === 'src' && value.startsWith('data:') &&
              !value.startsWith('data:image/')) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (tag === 'img' && name === 'src' && toAssetUrl) {
            const abs = resolveLocalPath(raw, baseDir);
            if (abs) el.setAttribute('src', toAssetUrl(abs));
          }
        }
      }
    }
  }

  global.downerCore = {
    MD_OPTIONS,
    baseName,
    dirOf,
    pathToFileUrl,
    fileUrlToPath,
    resolveLocalPath,
    BLOCKED_TAGS,
    sanitize
  };
})(typeof window !== 'undefined' ? window : globalThis);
