// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

#[derive(Serialize, Clone)]
struct FileData {
    path: String,
    content: String,
}

// Where a file the OS asked us to open waits for the frontend.
//
// Windows passes the path in argv, so it is readable whenever the frontend
// asks. macOS instead delivers it as an Apple Event (`RunEvent::Opened`) that
// can fire before the webview exists, so the path parks here until
// `get_opened_file` collects it.
#[derive(Default)]
struct OpenState(std::sync::Mutex<Pending>);

#[derive(Default)]
struct Pending {
    path: Option<String>,
    frontend_ready: bool,
}

impl OpenState {
    // The frontend is asking for its startup file, so it is listening from now
    // on. Hand over anything the OS queued before it was ready.
    fn take_pending(&self) -> Option<String> {
        let mut pending = self.0.lock().unwrap();
        pending.frontend_ready = true;
        pending.path.take()
    }

    // The OS wants us to open a file. Returns the path when the frontend can
    // receive it now; otherwise queues it and returns None.
    fn deliver(&self, path: String) -> Option<String> {
        let mut pending = self.0.lock().unwrap();
        if pending.frontend_ready {
            Some(path)
        } else {
            pending.path = Some(path);
            None
        }
    }
}

const MD_EXTS: [&str; 9] = [
    "md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "text", "txt",
];

fn is_md(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_lowercase();
            MD_EXTS.iter().any(|x| *x == e)
        })
        .unwrap_or(false)
}

// Find the markdown file path passed on the command line (file association / CLI).
fn file_from_args(args: &[String]) -> Option<String> {
    for a in args.iter().skip(1) {
        if a.starts_with('-') {
            continue;
        }
        if is_md(a) {
            return Some(normalize_path(a));
        }
    }
    None
}

// Find the markdown file among the URLs macOS hands over on an open request.
fn file_from_urls(urls: &[tauri::Url]) -> Option<String> {
    urls.iter()
        .filter_map(|u| u.to_file_path().ok())
        .map(|p| p.to_string_lossy().to_string())
        .find(|p| is_md(p))
        .map(|p| normalize_path(&p))
}

fn read_into_file_data(path: String) -> Option<FileData> {
    let content = std::fs::read_to_string(&path).ok()?;
    Some(FileData { path, content })
}

// Resolve to an absolute path WITHOUT the Windows extended-length prefix.
// std::fs::canonicalize returns paths like `\\?\C:\dir\file.md`, and that
// `\\?\` prefix breaks the WebView's asset:// URL resolver, so strip it.
fn normalize_path(path: &str) -> String {
    match std::fs::canonicalize(path) {
        Ok(p) => {
            let s = p.to_string_lossy().to_string();
            if let Some(rest) = s.strip_prefix("\\\\?\\UNC\\") {
                format!("\\\\{}", rest) // network share: \\?\UNC\server\share -> \\server\share
            } else if let Some(rest) = s.strip_prefix("\\\\?\\") {
                rest.to_string() // local drive: \\?\C:\dir -> C:\dir
            } else {
                s
            }
        }
        Err(_) => path.to_string(),
    }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// File supplied at launch (first instance), if any: whatever the OS queued
// before the frontend was listening, else the command line (Windows).
#[tauri::command]
fn get_opened_file(state: tauri::State<'_, OpenState>) -> Option<FileData> {
    let path = match state.take_pending() {
        Some(path) => path,
        None => {
            let args: Vec<String> = std::env::args().collect();
            file_from_args(&args)?
        }
    };
    read_into_file_data(path)
}

#[tauri::command]
fn set_title(window: tauri::WebviewWindow, title: String) {
    let _ = window.set_title(&title);
}

#[tauri::command]
fn open_external(url: String) {
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:") {
        let _ = open::that(url);
    }
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// Save As PDF works by printing the export document from the WebView, and
// WKWebView implements no print support at all, so the whole command is
// Windows-only. The frontend asks here and hides it rather than offering a
// button that silently does nothing.
#[tauri::command]
fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    static DIR_SEQ: AtomicU32 = AtomicU32::new(0);

    // A unique, empty directory per test (tests run in parallel).
    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "downer-test-{}-{}",
            std::process::id(),
            DIR_SEQ.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // ---- is_md ------------------------------------------------------

    #[test]
    fn is_md_accepts_every_supported_extension() {
        for ext in MD_EXTS {
            assert!(is_md(&format!("notes.{ext}")), "should accept .{ext}");
        }
    }

    #[test]
    fn is_md_is_case_insensitive() {
        assert!(is_md("README.MD"));
        assert!(is_md("Notes.Markdown"));
        assert!(is_md(r"C:\docs\FILE.TXT"));
    }

    #[test]
    fn is_md_rejects_other_files() {
        assert!(!is_md("app.exe"));
        assert!(!is_md("photo.png"));
        assert!(!is_md("notes.mdx"));
        assert!(!is_md("README"));
        assert!(!is_md(""));
    }

    #[test]
    fn is_md_looks_at_the_extension_not_the_name() {
        assert!(!is_md("md"));
        assert!(!is_md("markdown.zip"));
        assert!(is_md(r"C:\weird.dir\notes.md"));
    }

    // ---- file_from_args ----------------------------------------------

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn file_from_args_finds_the_markdown_argument() {
        let got = file_from_args(&args(&["downer.exe", "missing-file.md"]));
        // The file does not exist, so normalize_path passes it through.
        assert_eq!(got, Some("missing-file.md".to_string()));
    }

    #[test]
    fn file_from_args_skips_flags() {
        let got = file_from_args(&args(&["downer.exe", "--verbose", "-x", "a.md"]));
        assert_eq!(got, Some("a.md".to_string()));
    }

    #[test]
    fn file_from_args_ignores_argv0_even_if_it_looks_like_markdown() {
        assert_eq!(file_from_args(&args(&["editor.md"])), None);
    }

    #[test]
    fn file_from_args_returns_the_first_markdown_path() {
        let got = file_from_args(&args(&["downer.exe", "photo.png", "a.md", "b.md"]));
        assert_eq!(got, Some("a.md".to_string()));
    }

    #[test]
    fn file_from_args_returns_none_without_markdown() {
        assert_eq!(file_from_args(&args(&["downer.exe"])), None);
        assert_eq!(file_from_args(&args(&["downer.exe", "--flag", "photo.png"])), None);
    }

    // ---- normalize_path ------------------------------------------------

    #[test]
    fn normalize_path_strips_the_extended_length_prefix() {
        let dir = temp_dir();
        let file = dir.join("x.md");
        std::fs::write(&file, "hi").unwrap();

        let normalized = normalize_path(file.to_str().unwrap());
        assert!(
            !normalized.starts_with(r"\\?\"),
            "still has extended-length prefix: {normalized}"
        );
        // The normalized path must still reach the same file.
        assert_eq!(std::fs::read_to_string(&normalized).unwrap(), "hi");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn normalize_path_resolves_dot_dot_segments() {
        let dir = temp_dir();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        let file = dir.join("x.md");
        std::fs::write(&file, "hi").unwrap();

        let messy = dir.join("sub").join("..").join("x.md");
        let normalized = normalize_path(messy.to_str().unwrap());
        assert_eq!(normalized, normalize_path(file.to_str().unwrap()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn normalize_path_passes_missing_files_through() {
        assert_eq!(normalize_path("no/such/file.md"), "no/such/file.md");
    }

    // ---- read_file / write_file commands -------------------------------

    #[test]
    fn write_then_read_roundtrip() {
        let dir = temp_dir();
        let path = dir.join("doc.md").to_string_lossy().to_string();

        write_file(path.clone(), "# hello\n".to_string()).unwrap();
        assert_eq!(read_file(path).unwrap(), "# hello\n");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_file_overwrites_existing_content() {
        let dir = temp_dir();
        let path = dir.join("doc.md").to_string_lossy().to_string();

        write_file(path.clone(), "first".to_string()).unwrap();
        write_file(path.clone(), "second".to_string()).unwrap();
        assert_eq!(read_file(path).unwrap(), "second");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn roundtrip_preserves_unicode() {
        let dir = temp_dir();
        let path = dir.join("unicode.md").to_string_lossy().to_string();
        let content = "héllo → 世界 🚀\n";

        write_file(path.clone(), content.to_string()).unwrap();
        assert_eq!(read_file(path).unwrap(), content);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_file_reports_missing_files_as_errors() {
        let err = read_file("no/such/file.md".to_string()).unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn write_file_reports_unwritable_paths_as_errors() {
        let err = write_file(
            "no/such/dir/file.md".to_string(),
            "content".to_string(),
        )
        .unwrap_err();
        assert!(!err.is_empty());
    }

    // ---- file_from_urls ------------------------------------------------

    // An absolute path that does not exist, spelled the way the host OS spells
    // paths. Url::to_file_path rejects a Unix-style path on Windows, where a
    // file URL needs a drive letter, so neither form can be hard-coded.
    fn absent(name: &str) -> String {
        std::env::temp_dir().join(name).to_string_lossy().to_string()
    }

    fn file_url(name: &str) -> tauri::Url {
        tauri::Url::from_file_path(absent(name)).unwrap()
    }

    #[test]
    fn file_from_urls_finds_the_markdown_file() {
        let got = file_from_urls(&[file_url("missing-notes.md")]);
        assert_eq!(got, Some(absent("missing-notes.md")));
    }

    #[test]
    fn file_from_urls_returns_the_first_markdown_path() {
        let got = file_from_urls(&[
            file_url("missing-photo.png"),
            file_url("missing-a.md"),
            file_url("missing-b.md"),
        ]);
        assert_eq!(got, Some(absent("missing-a.md")));
    }

    #[test]
    fn file_from_urls_ignores_non_file_schemes() {
        let url = tauri::Url::parse("https://example.com/notes.md").unwrap();
        assert_eq!(file_from_urls(&[url]), None);
    }

    #[test]
    fn file_from_urls_returns_none_without_markdown() {
        assert_eq!(file_from_urls(&[file_url("missing-photo.png")]), None);
        assert_eq!(file_from_urls(&[]), None);
    }

    #[test]
    fn file_from_urls_decodes_percent_escapes() {
        let url = file_url("missing notes.md");
        assert!(url.as_str().contains("%20"), "space should be escaped: {url}");
        assert_eq!(file_from_urls(&[url]), Some(absent("missing notes.md")));
    }

    // ---- OpenState -------------------------------------------------------

    #[test]
    fn open_before_the_frontend_is_ready_waits_for_it() {
        let state = OpenState::default();

        // Nothing to emit yet: the renderer is not listening.
        assert_eq!(state.deliver("/tmp/a.md".to_string()), None);
        // The startup call collects it instead.
        assert_eq!(state.take_pending(), Some("/tmp/a.md".to_string()));
    }

    #[test]
    fn open_after_the_frontend_is_ready_goes_straight_out() {
        let state = OpenState::default();
        state.take_pending();

        assert_eq!(
            state.deliver("/tmp/a.md".to_string()),
            Some("/tmp/a.md".to_string())
        );
        // Delivered, not queued, so a later startup call finds nothing.
        assert_eq!(state.take_pending(), None);
    }

    #[test]
    fn a_queued_file_is_only_handed_over_once() {
        let state = OpenState::default();
        state.deliver("/tmp/a.md".to_string());

        assert_eq!(state.take_pending(), Some("/tmp/a.md".to_string()));
        assert_eq!(state.take_pending(), None);
    }

    #[test]
    fn take_pending_is_none_when_nothing_was_opened() {
        assert_eq!(OpenState::default().take_pending(), None);
    }

    #[test]
    fn a_later_open_replaces_one_still_queued() {
        let state = OpenState::default();
        state.deliver("/tmp/a.md".to_string());
        state.deliver("/tmp/b.md".to_string());

        assert_eq!(state.take_pending(), Some("/tmp/b.md".to_string()));
    }

    // ---- is_macos --------------------------------------------------------

    #[test]
    fn is_macos_agrees_with_the_running_platform() {
        // cfg! is resolved at compile time, env::consts::OS at run time; on a
        // native build they must agree.
        assert_eq!(is_macos(), std::env::consts::OS == "macos");
    }

    // ---- get_version ----------------------------------------------------

    #[test]
    fn version_is_three_part_semver() {
        let v = get_version();
        let parts: Vec<&str> = v.split('.').collect();
        assert_eq!(parts.len(), 3, "not semver: {v}");
        for p in parts {
            p.parse::<u64>().expect("non-numeric version component");
        }
    }
}

// macOS asks a running app to open further files instead of starting a second
// process, so push the file at the window the renderer already has open (it
// listens for "open-file" and prompts about unsaved changes itself).
#[cfg(target_os = "macos")]
fn handle_opened(app: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    use tauri::{Emitter, Manager};

    let Some(path) = file_from_urls(&urls) else {
        return;
    };
    // Before the frontend is ready this only queues the path, and the initial
    // get_opened_file call picks it up instead.
    if let Some(path) = app.state::<OpenState>().deliver(path) {
        if let Some(data) = read_into_file_data(path) {
            let _ = app.emit("open-file", data);
        }
    }
}

fn main() {
    // No single-instance plugin: on Windows each .md opened from Explorer
    // launches its own process and window, so multiple files can be open side
    // by side. macOS routes every open through the one running instance, which
    // handle_opened feeds into the existing window.
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenState::default())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            get_opened_file,
            set_title,
            open_external,
            get_version,
            is_macos
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            handle_opened(_app, urls);
        }
    });
}
