//! XDG .desktop file discovery — enumerates installed apps.
//!
//! Reads all `.desktop` files from standard XDG_DATA_DIRS locations:
//!   /usr/share/applications/
//!   /usr/local/share/applications/
//!   ~/.local/share/applications/

use crate::commands::AppEntry;
use anyhow::Result;
use std::path::PathBuf;

/// Discover all installed applications from XDG .desktop files.
pub async fn discover() -> Result<Vec<AppEntry>> {
    let dirs = xdg_app_dirs();
    let mut apps = Vec::new();

    for dir in dirs {
        if !dir.exists() {
            continue;
        }
        let mut read_dir = tokio::fs::read_dir(&dir).await?;
        while let Some(entry) = read_dir.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            if let Ok(app) = parse_desktop_file(&path).await {
                apps.push(app);
            }
        }
    }

    // Sort alphabetically.
    apps.sort_by(|a, b| a.name.cmp(&b.name));
    apps.dedup_by(|a, b| a.id == b.id);
    Ok(apps)
}

fn xdg_app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
    ];

    // $XDG_DATA_DIRS
    if let Ok(data_dirs) = std::env::var("XDG_DATA_DIRS") {
        for d in data_dirs.split(':') {
            dirs.push(PathBuf::from(d).join("applications"));
        }
    }

    // ~/.local/share/applications
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join(".local/share/applications"));
    }

    dirs
}

async fn parse_desktop_file(path: &PathBuf) -> Result<AppEntry> {
    let content = tokio::fs::read_to_string(path).await?;
    let mut name = String::new();
    let mut icon = String::new();
    let mut exec = String::new();
    let mut categories = Vec::new();
    let mut no_display = false;
    let mut hidden = false;
    let mut in_desktop_entry = false;

    for line in content.lines() {
        let line = line.trim();
        if line == "[Desktop Entry]" {
            in_desktop_entry = true;
            continue;
        }
        if line.starts_with('[') {
            in_desktop_entry = false;
            continue;
        }
        if !in_desktop_entry {
            continue;
        }

        if let Some(v) = line.strip_prefix("Name=") {
            if name.is_empty() {
                name = v.to_string();
            }
        } else if let Some(v) = line.strip_prefix("Icon=") {
            icon = v.to_string();
        } else if let Some(v) = line.strip_prefix("Exec=") {
            exec = v.to_string();
        } else if let Some(v) = line.strip_prefix("Categories=") {
            categories = v
                .split(';')
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect();
        } else if line == "NoDisplay=true" {
            no_display = true;
        } else if line == "Hidden=true" {
            hidden = true;
        }
    }

    if name.is_empty() || exec.is_empty() || no_display || hidden {
        anyhow::bail!("skip");
    }

    // Derive an ID from the filename.
    let id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&name)
        .to_string();

    Ok(AppEntry {
        id,
        name,
        icon,
        categories,
        exec,
    })
}
