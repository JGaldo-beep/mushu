use std::str::FromStr;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub(crate) fn parse_shortcut(value: &str) -> Result<Shortcut, String> {
    Shortcut::from_str(value).map_err(|e| format!("Hotkey inválida: {e}"))
}

pub(crate) fn map_shortcut_register_error(raw: String, shortcut_text: &str, label: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("already registered") {
        return format!(
            "No se pudo registrar el atajo {label} ({shortcut_text}) porque ya está en uso por otra app o instancia."
        );
    }
    raw
}

/// Registra el atajo Escape solo durante la grabación, diferido fuera del callback de shortcut
/// global para evitar reentrar el handler que está en pila.
pub(crate) fn register_escape_shortcut(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(esc) = parse_shortcut("Escape") else {
            return;
        };
        if let Err(e) = app.global_shortcut().register(esc) {
            eprintln!("[mushu] no se pudo registrar Escape: {e}");
        }
    });
}

pub(crate) fn unregister_escape_shortcut(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(esc) = parse_shortcut("Escape") else {
            return;
        };
        let _ = app.global_shortcut().unregister(esc);
    });
}
