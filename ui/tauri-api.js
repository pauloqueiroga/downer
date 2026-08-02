'use strict';

/* ------------------------------------------------------------------ *
 * Bridge: expose the same window.api surface the renderer expects,    *
 * implemented on Tauri's global APIs (withGlobalTauri = true).        *
 * Filesystem reads/writes go through our own Rust commands so the app *
 * can open files anywhere, without the fs plugin's path scoping.      *
 * ------------------------------------------------------------------ */

const { invoke, convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;
const dialog = window.__TAURI__.dialog;

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
  { name: 'All Files', extensions: ['*'] }
];

window.api = {
  // File supplied at launch (file association / CLI). -> { path, content } | null
  init: () => invoke('get_opened_file'),

  // Save to a known path. -> { ok }
  save: async (path, content) => {
    try { await invoke('write_file', { path, content }); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  },

  // Prompt for a location, then write. -> { path } | null
  saveAs: async (content) => {
    const path = await dialog.save({
      defaultPath: 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });
    if (!path) return null;
    try { await invoke('write_file', { path, content }); return { path }; }
    catch (e) { return null; }
  },

  // Open-file dialog, then read. -> { path, content } | null
  open: async () => {
    const path = await dialog.open({ multiple: false, directory: false, filters: MD_FILTERS });
    if (!path) return null;
    try {
      const content = await invoke('read_file', { path });
      return { path, content };
    } catch (e) { return null; }
  },

  // Open a link in the system browser.
  openExternal: (url) => invoke('open_external', { url }),

  // About dialog: shows the version (and, later, a link to the project page).
  about: async () => {
    let version = '';
    try { version = await invoke('get_version'); } catch (e) { /* ignore */ }
    await dialog.message(
      `downer ${version}\n\nA minimal, fast, local markdown editor.\n` +
      `Source on the left, live preview on the right.`,
      { title: 'About downer', kind: 'info' }
    );
  },

  // Set the native window title.
  setTitle: (title) => invoke('set_title', { title }),

  // Convert an absolute filesystem path into an asset:// URL the WebView can load.
  toAssetUrl: (path) => convertFileSrc(path),

  // A file handed to the running window (file association / 2nd launch).
  onOpenFile: (cb) => listen('open-file', (event) => cb(event.payload)),

  // Title-bar X / Alt+F4. Tauri holds the window open while a JS listener is
  // registered and destroys it once the handler returns without preventing
  // the default, so `cb` decides. A throwing guard keeps the window open —
  // never lose a buffer to a bug in the prompt.
  onCloseRequested: (cb) => getCurrentWindow().onCloseRequested(async (event) => {
    let allow = false;
    try { allow = await cb(); } catch (e) { allow = false; }
    if (!allow) event.preventDefault();
  })
};
