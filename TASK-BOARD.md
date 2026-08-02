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

- Binaries for MacOS and Linux
- Accessibility audit (screen reader support, ARIA labels, focus management)
- Use the Save / Don't Save / Cancel prompt for New and Open too (they still use a plain discard confirm)

---

## To Do

- Address `npm audit` advisories: `dompurify` (via `monaco-editor`, moderate) and `linkify-it` (via `markdown-it`, high)
- GitHub releases
- Sonarqube static analysis
- GitHub Pages

---

## In Progress

(nothing right now)

---

## Won't Do

(nothing right now)

---

## Usage Notes

- Move items between sections as work progresses. Completed work lives in `git log`, not here.
- Keep **In Progress** short (ideally 1–2 items at a time).
- Add a brief note or issue reference next to items when helpful, e.g. `- Fix tile color bug (#12)`.
- Commit this file with the same PR/commit as the work it describes.
