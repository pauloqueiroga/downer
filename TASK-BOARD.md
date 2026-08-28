# Task Board

A lightweight Kanban-style board, version-controlled alongside the code.

## Stages

| Stage | Meaning |
| --- | --- |
| **Wish List** | Ideas worth keeping, not yet committed to |
| **To Do** | Agreed upon, ready to be picked up |
| **In Progress** | Actively being worked on |
| **Won't Do** | Considered and consciously declined |

---

## Wish List

- Binaries for Linux
- Save As PDF on macOS: WKWebView ignores `window.print()`, so the print-a-hidden-frame approach has nothing to hook into. The button and shortcut are hidden there (`is_macos`), not removed — un-hide them in `renderer.js` once there is an engine behind them
- Toolbar tooltips say `Ctrl` on macOS, though the shortcuts themselves already accept `Cmd`
- Accessibility audit (screen reader support, ARIA labels, focus management)
- Use the Save / Don't Save / Cancel prompt for New and Open too (they still use a plain discard confirm)
- Heading anchors: markdown-it emits no `id`s, so `[link](#section)` never resolves in the preview or in an export
- Save As should suggest the current file name (it always offers `untitled.md`)
- Write PDFs directly, without the print dialog (needs a PDF engine — Save As PDF prints instead)

---

## To Do

- Address `npm audit` advisories: `dompurify` (via `monaco-editor`, moderate) and `linkify-it` (via `markdown-it`, high)
- GitHub releases
- Sonarqube static analysis
- GitHub Pages

---

## In Progress

- macOS binaries (#8) — CI builds the arm64 and Intel `.dmg`s. Tested on an Intel Mac: the unsaved-changes prompt reloaded the app in a loop (fixed), and opening a double-clicked `.md` still needs checking

---

## Won't Do

(nothing right now)

---

## Usage Notes

- Move items between sections as work progresses. Completed work lives in `git log`, not here.
- Keep **In Progress** short (ideally 1–2 items at a time).
- Add a brief note or issue reference next to items when helpful, e.g. `- Fix tile color bug (#12)`.
- Commit this file with the same PR/commit as the work it describes.
