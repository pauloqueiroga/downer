// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

#[derive(Serialize, Clone)]
struct FileData {
    path: String,
    content: String,
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

// File supplied at launch (first instance), if any.
#[tauri::command]
fn get_opened_file() -> Option<FileData> {
    let args: Vec<String> = std::env::args().collect();
    let path = file_from_args(&args)?;
    let content = std::fs::read_to_string(&path).ok()?;
    Some(FileData { path, content })
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

fn main() {
    // No single-instance plugin: each .md opened from Explorer launches its own
    // process and window, so multiple files can be open side by side.
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            get_opened_file,
            set_title,
            open_external,
            get_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
