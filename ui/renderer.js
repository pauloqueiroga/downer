'use strict';

/* ------------------------------------------------------------------ *
 * downer renderer: Monaco source (left) + markdown-it preview (right) *
 * ------------------------------------------------------------------ */

// ---- shared core (see ui/preview-core.js) --------------------------
const { baseName, dirOf, sanitize } = window.downerCore;

// ---- markdown-it ---------------------------------------------------
const md = window.markdownit(window.downerCore.MD_OPTIONS);

// ---- DOM refs ------------------------------------------------------
const preview = document.getElementById('preview');
const previewWrap = document.getElementById('preview-wrap');
const stPos = document.getElementById('st-pos');
const stCounts = document.getElementById('st-counts');
const stSave = document.getElementById('st-save');

// ---- editor state --------------------------------------------------
let editor = null;
let currentPath = null;   // absolute path of the open file, or null (untitled)
let dirty = false;
let lastSaved = '';       // content as last written to disk
let lastSavedAt = null;   // Date of last save/open, or null for a fresh buffer
let savedVerb = 'New file';
let syncingScroll = false;

// ---- helpers -------------------------------------------------------
function isDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function timeStr(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateTitle() {
  const name = baseName(currentPath);
  const loc = currentPath ? ` (In ${currentPath})` : '';
  window.api.setTitle(`${dirty ? '● ' : ''}${name} - downer${loc}`);
}

function updateSaveStatus() {
  if (dirty) {
    stSave.textContent = '● Unsaved changes';
    stSave.classList.add('dirty');
    return;
  }
  stSave.classList.remove('dirty');
  stSave.textContent = lastSavedAt
    ? `${savedVerb} ${timeStr(lastSavedAt)}`
    : 'New file';
}

function setDirty(value) {
  if (dirty === value) return;
  dirty = value;
  updateTitle();
  updateSaveStatus();
}

function updateCounts() {
  const model = editor.getModel();
  const text = model.getValue();
  const lines = model.getLineCount();
  const words = (text.match(/\S+/g) || []).length;
  const chars = text.length;
  stCounts.textContent =
    `${lines} line${lines === 1 ? '' : 's'} · ` +
    `${words} word${words === 1 ? '' : 's'} · ` +
    `${chars} character${chars === 1 ? '' : 's'}`;
}

function updatePosition() {
  const pos = editor.getPosition();
  if (pos) stPos.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
}

// ---- render --------------------------------------------------------
// Markdown -> HTML -> sanitize (see ui/preview-core.js) -> preview DOM.
function render() {
  const html = md.render(editor.getValue());
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  sanitize(tmp, currentPath ? dirOf(currentPath) : null, window.api.toAssetUrl);
  preview.replaceChildren(...tmp.childNodes);
}

let renderTimer = null;
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { render(); updateCounts(); }, 60);
}

// ---- load / save / new --------------------------------------------
function loadDocument(path, content) {
  currentPath = path;
  lastSaved = content;
  lastSavedAt = new Date();
  savedVerb = 'Opened';
  editor.setValue(content);
  editor.setScrollPosition({ scrollTop: 0 });
  previewWrap.scrollTop = 0;
  dirty = false;
  updateTitle();
  updateSaveStatus();
  updateCounts();
  updatePosition();
  render();
}

function newDocument() {
  if (!confirmDiscardIfDirty()) return;
  currentPath = null;
  lastSaved = '';
  lastSavedAt = null;
  savedVerb = 'New file';
  editor.setValue('');
  previewWrap.scrollTop = 0;
  dirty = false;
  updateTitle();
  updateSaveStatus();
  updateCounts();
  updatePosition();
  render();
  editor.focus();
}

function confirmDiscardIfDirty() {
  if (!dirty) return true;
  return window.confirm('You have unsaved changes. Discard them?');
}

async function save() {
  const content = editor.getValue();
  if (currentPath) {
    const res = await window.api.save(currentPath, content);
    if (res && res.ok) {
      lastSaved = content;
      lastSavedAt = new Date();
      savedVerb = 'Saved';
      setDirty(false);
      updateSaveStatus();
    }
    return;
  }
  await saveAs();
}

async function saveAs() {
  const content = editor.getValue();
  const res = await window.api.saveAs(content);
  if (res && res.path) {
    currentPath = res.path;
    lastSaved = content;
    lastSavedAt = new Date();
    savedVerb = 'Saved';
    setDirty(false);
    updateTitle();
    updateSaveStatus();
  }
}

async function openFromDialog() {
  if (!confirmDiscardIfDirty()) return;
  const res = await window.api.open();
  if (res) loadDocument(res.path, res.content);
}

// ---- toolbar -------------------------------------------------------
document.getElementById('toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-cmd]');
  if (!btn) return;
  switch (btn.dataset.cmd) {
    case 'new': newDocument(); break;
    case 'open': openFromDialog(); break;
    case 'save': save(); break;
    case 'saveas': saveAs(); break;
    case 'about': window.api.about(); break;
  }
});

// ---- link handling in preview -------------------------------------
preview.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  e.preventDefault();
  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1));
    const target = preview.querySelector(
      `#${CSS.escape(id)}, [name="${CSS.escape(id)}"]`
    );
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (/^(https?:|mailto:)/i.test(href)) {
    window.api.openExternal(href);
  }
});

// ---- editor -> preview scroll sync --------------------------------
function syncScroll() {
  if (syncingScroll) return;
  syncingScroll = true;
  const top = editor.getScrollTop();
  const height = editor.getScrollHeight() - editor.getLayoutInfo().height;
  const ratio = height > 0 ? top / height : 0;
  const target = previewWrap.scrollHeight - previewWrap.clientHeight;
  previewWrap.scrollTop = ratio * target;
  requestAnimationFrame(() => { syncingScroll = false; });
}

// ---- divider drag --------------------------------------------------
function setupDivider() {
  const divider = document.getElementById('divider');
  const app = document.getElementById('app');
  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    const rect = app.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.min(85, Math.max(15, pct));
    document.documentElement.style.setProperty('--editor-width', pct + '%');
  };
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (editor) editor.layout();
  };

  divider.addEventListener('mousedown', (e) => {
    dragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', stop);
}

// ---- keyboard shortcuts (no menu) ---------------------------------
function setupShortcuts() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 's' && e.shiftKey) { e.preventDefault(); saveAs(); }
    else if (key === 's') { e.preventDefault(); save(); }
    else if (key === 'o') { e.preventDefault(); openFromDialog(); }
    else if (key === 'n') { e.preventDefault(); newDocument(); }
  });
}

// ---- boot ----------------------------------------------------------
require.config({ paths: { vs: 'vendor/monaco/vs' } });

require(['vs/editor/editor.main'], async function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'markdown',
    theme: isDark() ? 'vs-dark' : 'vs',
    automaticLayout: true,
    wordWrap: 'on',
    minimap: { enabled: false },
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    fontSize: 14,
    lineHeight: 22,
    padding: { top: 12, bottom: 12 },
    tabSize: 2,
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
    quickSuggestions: false,
    occurrencesHighlight: 'off',
    folding: true,
    cursorBlinking: 'smooth',
    scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 }
  });

  // Force a layout pass so the editor fills its panel immediately.
  editor.layout();
  requestAnimationFrame(() => editor.layout());
  window.addEventListener('resize', () => editor.layout());

  editor.onDidChangeModelContent(() => {
    scheduleRender();
    setDirty(editor.getValue() !== lastSaved);
  });
  editor.onDidChangeCursorPosition(updatePosition);
  editor.onDidScrollChange(syncScroll);

  setupDivider();
  setupShortcuts();

  // Follow OS theme changes live.
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => {
      monaco.editor.setTheme(e.matches ? 'vs-dark' : 'vs');
    });

  // A file handed to an already-running window (file association / 2nd launch).
  window.api.onOpenFile((data) => {
    if (!data) return;
    if (!confirmDiscardIfDirty()) return;
    loadDocument(data.path, data.content);
  });

  // File supplied at launch, if any.
  const initial = await window.api.init();
  if (initial) {
    loadDocument(initial.path, initial.content);
  } else {
    updateTitle();
    updateSaveStatus();
    updateCounts();
    updatePosition();
    render();
  }

  editor.focus();
});
