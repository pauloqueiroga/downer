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
the WebView already in Windows — so the whole app is a few MB and launches fast,
instead of bundling a copy of Chromium.

## What it does

- Split view: Monaco editor (left ~⅓) + live preview (right ~⅔).
- Edits render live as you type.
- Follows your Windows light/dark setting automatically.
- Opens the file you double-click (once set as the default `.md` handler).
- Local images in your markdown (`![](images/pic.png)`) render, resolved
  relative to the file on disk.
- Drag the divider to change the split.
- Slim toolbar (New / Open / Save / Save As / About) plus a status bar with
  cursor position, line/word/character counts, and last save time.
- Title bar shows the file name and full path: `name.md - downer (In C:\path\to\name.md)`.

### Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl + N` | New |
| `Ctrl + O` | Open |
| `Ctrl + S` | Save |
| `Ctrl + Shift + S` | Save As |

An unsaved file shows a `●` in the title and the status bar.

## Prerequisites

To build, you need:

- [Node.js](https://nodejs.org) 18+ (for the Tauri CLI and to copy the editor assets).
- [Rust](https://rustup.rs) (stable).
- **Windows:** the Microsoft C++ Build Tools (the "Desktop development with C++"
  workload) and the WebView2 runtime. WebView2 ships with Windows 11 and recent
  Windows 10; the build tools come with Visual Studio or its standalone Build Tools.

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

## Build the Windows app + installer

```bash
npm run build
```

This produces an NSIS installer under
`src-tauri/target/release/bundle/nsis/` (e.g. `downer_1.0.0_x64-setup.exe`).
Installing it registers `downer` as a handler for `.md` and `.markdown` files
and creates shortcuts.

## Releasing

Every push to `main` runs a CI build (`.github/workflows/ci.yml`) that compiles
the app and uploads the installer as a dev artifact — this catches build
breakage on every merge but isn't an official release.

To cut an official release:

```bash
npm run release -- patch   # or: minor | major | x.y.z
```

This bumps the version in `package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml` together, commits, tags (`vX.Y.Z`), and pushes both —
requires a clean working tree. Pushing the tag triggers
`.github/workflows/build.yml`, which verifies all three files agree with the
tag, builds the installer, and uploads it as a release artifact.

## Make it the default for `.md` files

Windows won't switch the default automatically. Set it once:

1. Right-click any `.md` file → **Open with** → **Choose another app**.
2. Pick **downer** (use **More apps** → **Look for another app on this PC** and
   browse to the installed `downer.exe` if it isn't listed).
3. Check **Always use this app to open .md files** → **OK**.

Double-clicking a `.md` file then opens it in downer. If downer is already open,
the file loads into the existing window.

## How it's wired

- The frontend is sandboxed; all filesystem access goes through small Rust
  commands, so the app can open files anywhere without exposing a broad JS file API.
- Rendered HTML is sanitized before insertion (inline event handlers,
  `javascript:` URLs, `<script>/<iframe>/<object>` etc. are stripped), so opening
  an untrusted `.md` can't run code.
- Local images are loaded via Tauri's `asset:` protocol. The asset scope in
  `tauri.conf.json` is broad (`**/*`) so images next to any opened file work; if
  you only ever open files under one folder, narrow it for tighter security.

## License

MIT
