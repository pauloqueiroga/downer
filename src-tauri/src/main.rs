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
