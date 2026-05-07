use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub(crate) const CLIPBOARD_GROQ_MAX_CHARS: usize = 12_000;

pub(crate) fn read_clipboard_text() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

pub(crate) fn truncate_for_groq(s: &str) -> String {
    let count = s.chars().count();
    if count <= CLIPBOARD_GROQ_MAX_CHARS {
        return s.to_string();
    }
    s.chars().take(CLIPBOARD_GROQ_MAX_CHARS).collect()
}

#[tauri::command]
pub(crate) fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

pub(crate) fn paste_text(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| format!("No se pudo abrir clipboard: {error}"))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|error| format!("No se pudo copiar texto al clipboard: {error}"))?;
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|error| format!("No se pudo inicializar enigo: {error}"))?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|error| format!("No se pudo presionar Ctrl: {error}"))?;
    enigo
        .key(Key::V, Direction::Click)
        .map_err(|error| format!("No se pudo presionar V: {error}"))?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|error| format!("No se pudo soltar Ctrl: {error}"))?;
    Ok(())
}

/// Envía Ctrl+C (o Cmd+C en macOS) al sistema para copiar la selección del foco actual.
pub(crate) fn simulate_copy_selection() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|error| format!("No se pudo inicializar enigo: {error}"))?;
    #[cfg(target_os = "macos")]
    {
        enigo
            .key(Key::Meta, Direction::Press)
            .map_err(|e| format!("No se pudo presionar Cmd: {e}"))?;
        enigo
            .key(Key::C, Direction::Click)
            .map_err(|e| format!("No se pudo presionar C: {e}"))?;
        enigo
            .key(Key::Meta, Direction::Release)
            .map_err(|e| format!("No se pudo soltar Cmd: {e}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|error| format!("No se pudo presionar Ctrl: {error}"))?;
        enigo
            .key(Key::C, Direction::Click)
            .map_err(|error| format!("No se pudo presionar C: {error}"))?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|error| format!("No se pudo soltar Ctrl: {error}"))?;
    }
    Ok(())
}
