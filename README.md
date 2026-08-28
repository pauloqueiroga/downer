<img src="build/downer.png" width="96" alt="downer logo">

# downer

A minimal, fast, local markdown editor. Source on the left third, live rendered
preview on the right two thirds. You type, it renders. That's it.

No "open preview" command, no panels, no extensions, no settings to wade
through. It opens instantly, runs as a native window, and is meant to be your
default app for `.md` files.

Built on [Monaco](https://github.com/microsoft/monaco-editor) (the editor from
VS Code) for editing and [markdown-it](https://github.com/markdown-it/markdown-it)
for rendering, wrapped in a thin [Tauri](https://v2.tauri.app) shell that uses
the WebView already in your OS — WebView2 on Windows, WKWebView on macOS — so
the whole app is a few MB and launches fast, instead of bundling a copy of
Chromium.

## What it does

- Split view: Monaco editor (left ~⅓) + live preview (right ~⅔).
- Edits render live as you type.
- Follows your system light/dark setting automatically.
- Opens the file you double-click (once set as the default `.md` handler).
- Local images in your markdown (`![](images/pic.png)`) render, resolved
  relative to the file on disk.
- Drag the divider to change the split.
- Export the rendered document as a standalone `.html` file (**Save As HTML**):
  one file, styles inlined, light/dark aware, and print-friendly.
- Print the rendered document, or save it as a PDF (**Save As PDF**): opens
  the Windows print dialog on the same page the HTML export produces — pick
  **Microsoft Print to PDF** (or any PDF printer) to write the file. Windows
  only for now — macOS's WebView has no print support, so the button and its
  shortcut are hidden there rather than left to do nothing.
- Slim toolbar (New / Open / Save / Save As / Save As HTML / Save As PDF /
  About) plus a status bar with cursor position, line/word/character counts,
  and last save time.
- Title bar shows the file name and full path: `name.md - downer (In C:\path\to\name.md)`.

### Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl + N` | New |
| `Ctrl + O` | Open |
| `Ctrl + S` | Save |
| `Ctrl + Shift + S` | Save As |
| `Ctrl + Shift + H` | Save As HTML |
| `Ctrl + Shift + P` | Save As PDF (Windows only) |

On macOS, use `Cmd` wherever the table says `Ctrl`.

An unsaved file shows a `●` in the title and the status bar. Closing the window
with unsaved changes asks first — **Save**, **Don't Save**, or **Cancel** (`Esc`
cancels). If saving an untitled buffer, the Save As dialog opens; dismissing it
leaves the window open rather than losing the text.

## Prerequisites

To build, you need:

- [Node.js](https://nodejs.org) 18+ (for the Tauri CLI and to copy the editor assets).
- [Rust](https://rustup.rs) (stable).
- **Windows:** the Microsoft C++ Build Tools (the "Desktop development with C++"
  workload) and the WebView2 runtime. WebView2 ships with Windows 11 and recent
  Windows 10; the build tools come with Visual Studio or its standalone Build Tools.
- **macOS:** the Xcode Command Line Tools (`xcode-select --install`). WKWebView
  is part of the OS, so there is nothing else to install. macOS 10.15+.

See Tauri's [prerequisites guide](https://v2.tauri.app/start/prerequisites/) for
exact installer links.

## Run it (development)

```bash
npm install
npm run dev
```

`npm run dev` runs `tauri dev`, which first copies Monaco and markdown-it into
`ui/vendor/` (via `npm run sync-assets`), compiles the Rust shell, and opens the
window. The first compile takes a minute; subsequent runs are fast.

## Contributing

See [`TASK-BOARD.md`](TASK-BOARD.md) for the current backlog and workflow. As you
work, move items between stages (Wish List → To Do → In Progress → Done/Won't Do)
and commit the updated board with your work.

## Build the app

On Windows:

```bash
npm run build
```

This produces an NSIS installer under
`src-tauri/target/release/bundle/nsis/` (e.g. `downer_1.0.0_x64-setup.exe`).
Installing it registers `downer` as a handler for `.md` and `.markdown` files
and creates shortcuts.

On macOS, point the build at the macOS bundle config:

```bash
npm run build -- --config src-tauri/tauri.macos.conf.json
```

That writes `downer.app` and a `.dmg` under `src-tauri/target/release/bundle/`.
The overlay exists because the base config bundles NSIS, which is Windows-only;
it also ad-hoc signs the app, matching what CI produces.

## Releasing

Every push to `main` runs a CI build (`.github/workflows/ci.yml`) that compiles
the app on every platform and uploads the results as dev artifacts — this
catches build breakage on every merge but isn't an official release.

To cut an official release:

```bash
npm run release -- patch   # or: minor | major | x.y.z
```

This bumps the version in `package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml` together, commits, tags (`vX.Y.Z`), and pushes both —
requires a clean working tree. Pushing the tag triggers
`.github/workflows/build.yml`, which verifies all three files agree with the
tag, then builds and uploads one artifact per platform:

| Artifact | What's in it |
| --- | --- |
| `downer-vX.Y.Z-windows` | NSIS installer (`.exe`), x86_64 |
| `downer-vX.Y.Z-macos-arm64` | `.dmg` for Apple Silicon |
| `downer-vX.Y.Z-macos-x64` | `.dmg` for Intel |

The two macOS builds both run on an Apple Silicon runner; the Intel one is
cross-compiled.

## Installing on macOS

The `.dmg` is ad-hoc signed but not notarized, because notarizing needs a paid
Apple Developer account. macOS quarantines anything downloaded without one, so
a plain double-click reports that downer "is damaged and can't be opened".

Drag downer to Applications, then open it the first time with a right-click (or
Control-click) → **Open** → **Open**, which records your consent. Every launch
after that is a normal double-click. If macOS still refuses, clear the
quarantine flag directly:

```bash
xattr -dr com.apple.quarantine /Applications/downer.app
```

## Make it the default for `.md` files

Neither OS will switch the default automatically. Set it once:

**Windows**

1. Right-click any `.md` file → **Open with** → **Choose another app**.
2. Pick **downer** (use **More apps** → **Look for another app on this PC** and
   browse to the installed `downer.exe` if it isn't listed).
3. Check **Always use this app to open .md files** → **OK**.

**macOS**

1. Right-click any `.md` file → **Get Info**.
2. Under **Open with**, pick **downer**.
3. Click **Change All…** to apply it to every `.md` file.

Double-clicking a `.md` file then opens it in downer. If downer is already open,
the file loads into the existing window.

## How it's wired

- The frontend is sandboxed; all filesystem access goes through small Rust
  commands, so the app can open files anywhere without exposing a broad JS file API.
- Rendered HTML is sanitized before insertion (inline event handlers,
  `javascript:` URLs, `<script>/<iframe>/<object>` etc. are stripped), so opening
  an untrusted `.md` can't run code.
- **Save As HTML** re-renders the buffer through the same markdown-it +
  sanitizer pipeline as the preview, then inlines the stylesheet, so the result
  opens anywhere with no `asset:` URLs and no scripts. Local images are pointed
  at their real files, relative to wherever the export is saved — keep the
  export next to the markdown and its images keep working.
- **Save As PDF** prints rather than writes: downer bundles no PDF engine, so
  the export document (same pipeline, plus print rules — page margins, no page
  breaks inside code blocks or tables, white paper in dark mode) is loaded into
  an offscreen frame and that frame is printed. Windows' PDF printer does the
  saving, and the document title becomes the suggested file name. Images use
  `asset:` URLs there, since the page is printed from inside the app. WKWebView
  implements no print support at all, which leaves nothing to hook into, so the
  command is hidden on macOS instead of sitting there doing nothing.
- The unsaved-changes prompt does not rely on `<dialog>` working. WKWebView
  only learned the element in Safari 15.4, and an older one renders it as an
  ordinary visible block — with a `<form method="dialog">` inside, every button
  then submits for real and reloads the app. So the prompt is opened and closed
  through the `open` attribute, which works anywhere, and `showModal()` is used
  only where it exists, for the focus trap it brings.
- The two systems hand over a double-clicked file differently: Windows puts the
  path in the command line and starts a fresh process per file, so several can
  sit side by side, while macOS sends an Apple Event to the single running
  instance. Both end up in the same place — at startup the path comes from argv
  or from wherever the Apple Event parked it, and anything opened later arrives
  as an `open-file` event that the renderer treats like any other open.
- Local images are loaded via Tauri's `asset:` protocol. The asset scope in
  `tauri.conf.json` is broad (`**/*`) so images next to any opened file work; if
  you only ever open files under one folder, narrow it for tighter security.

## License

MIT
