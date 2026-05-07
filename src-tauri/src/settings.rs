use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

use crate::modes::{validate_model, Mode};
use crate::{
    parse_shortcut, AppState, FrontendState, DEFAULT_HOTKEY, DEFAULT_MODEL, DEFAULT_MODE_HOTKEY,
    DEFAULT_PAUSE_HOTKEY, LEGACY_DEFAULT_MODE_HOTKEY,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProcessingMode {
    CloudFirst,
    LocalOnly,
}

impl ProcessingMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::CloudFirst => "cloud_first",
            Self::LocalOnly => "local_only",
        }
    }
}

impl Default for ProcessingMode {
    fn default() -> Self {
        Self::CloudFirst
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TranscriptionProvider {
    #[default]
    Groq,
    Deepgram,
}

impl TranscriptionProvider {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Groq => "groq",
            Self::Deepgram => "deepgram",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AppTheme {
    System,
    Light,
    Dark,
}

impl Default for AppTheme {
    fn default() -> Self {
        Self::System
    }
}

impl AppTheme {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }
}

pub(crate) fn default_sound_effects_enabled() -> bool {
    true
}

pub(crate) fn default_sound_effects_volume() -> f32 {
    0.22
}

pub(crate) fn default_mode_hotkey() -> String {
    DEFAULT_MODE_HOTKEY.to_string()
}

pub(crate) fn default_pause_hotkey() -> String {
    DEFAULT_PAUSE_HOTKEY.to_string()
}

/// Clave ausente en `settings.json` antiguo: no mostrar onboarding de nuevo.
pub(crate) fn default_onboarding_completed_for_missing_key() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct AppSettings {
    pub(crate) hotkey: String,
    #[serde(default = "default_mode_hotkey")]
    pub(crate) mode_hotkey: String,
    #[serde(default = "default_pause_hotkey")]
    pub(crate) pause_hotkey: String,
    pub(crate) model: String,
    #[serde(default)]
    pub(crate) processing_mode: ProcessingMode,
    #[serde(default)]
    pub(crate) transcription_provider: TranscriptionProvider,
    pub(crate) mode: Mode,
    pub(crate) microphone: Option<String>,
    #[serde(default)]
    pub(crate) theme: AppTheme,
    #[serde(default = "default_sound_effects_enabled")]
    pub(crate) sound_effects_enabled: bool,
    #[serde(default = "default_sound_effects_volume")]
    pub(crate) sound_effects_volume: f32,
    #[serde(default = "default_onboarding_completed_for_missing_key")]
    pub(crate) onboarding_completed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.to_string(),
            mode_hotkey: default_mode_hotkey(),
            pause_hotkey: default_pause_hotkey(),
            model: DEFAULT_MODEL.to_string(),
            processing_mode: ProcessingMode::CloudFirst,
            transcription_provider: TranscriptionProvider::default(),
            mode: Mode::Default,
            microphone: None,
            theme: AppTheme::default(),
            sound_effects_enabled: default_sound_effects_enabled(),
            sound_effects_volume: default_sound_effects_volume(),
            onboarding_completed: false,
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct SaveSettingsInput {
    pub(crate) hotkey: String,
    pub(crate) mode_hotkey: String,
    #[serde(default = "default_pause_hotkey")]
    pub(crate) pause_hotkey: String,
    pub(crate) model: String,
    pub(crate) processing_mode: ProcessingMode,
    #[serde(default)]
    pub(crate) transcription_provider: TranscriptionProvider,
    pub(crate) microphone: Option<String>,
    #[serde(default)]
    pub(crate) theme: AppTheme,
    #[serde(default = "default_sound_effects_enabled")]
    pub(crate) sound_effects_enabled: bool,
    #[serde(default = "default_sound_effects_volume")]
    pub(crate) sound_effects_volume: f32,
}

pub(crate) fn settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|p| p.join("settings.json"))
}

pub(crate) fn save_settings_file(
    app: &tauri::AppHandle,
    settings: &AppSettings,
) -> Result<(), String> {
    let path = settings_path(app).ok_or_else(|| "No se pudo resolver settings path".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, serialized).map_err(|e| e.to_string())
}

pub(crate) fn load_settings_file(app: &tauri::AppHandle) -> AppSettings {
    let Some(path) = settings_path(app) else {
        return AppSettings::default();
    };
    match fs::read_to_string(path) {
        Ok(raw) => {
            let parsed = serde_json::from_str::<AppSettings>(&raw).unwrap_or_default();
            normalize_settings(parsed)
        }
        Err(_) => AppSettings::default(),
    }
}

pub(crate) fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    if parse_shortcut(&settings.hotkey).is_err() {
        settings.hotkey = DEFAULT_HOTKEY.to_string();
    }
    if parse_shortcut(&settings.mode_hotkey).is_err() {
        settings.mode_hotkey = default_mode_hotkey();
    }
    if parse_shortcut(&settings.pause_hotkey).is_err() {
        settings.pause_hotkey = default_pause_hotkey();
    }
    // Antes el default de modo era Ctrl+Shift+Space (choca con 1Password y otras apps).
    if settings.mode_hotkey == LEGACY_DEFAULT_MODE_HOTKEY {
        settings.mode_hotkey = DEFAULT_MODE_HOTKEY.to_string();
    }
    if settings.hotkey == settings.mode_hotkey {
        settings.mode_hotkey = default_mode_hotkey();
        if settings.hotkey == settings.mode_hotkey {
            settings.mode_hotkey = "Ctrl+Alt+Space".to_string();
        }
    }
    // Pausa no puede coincidir con dictado ni con cambio de modo.
    if settings.pause_hotkey == settings.hotkey || settings.pause_hotkey == settings.mode_hotkey {
        settings.pause_hotkey = default_pause_hotkey();
        if settings.pause_hotkey == settings.hotkey || settings.pause_hotkey == settings.mode_hotkey
        {
            settings.pause_hotkey = "Ctrl+Alt+P".to_string();
        }
    }
    if validate_model(&settings.model).is_err() {
        settings.model = DEFAULT_MODEL.to_string();
    }
    settings.sound_effects_volume = settings.sound_effects_volume.clamp(0.0_f32, 1.0_f32);
    settings
}

/// Lee solo el flag desde disco para que coincida con `settings.json` sin reiniciar el proceso
/// (p. ej. demos) y para evitar desincronía memoria ↔ archivo.
pub(crate) fn read_onboarding_completed_from_disk(app: &tauri::AppHandle) -> Option<bool> {
    let path = settings_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("onboarding_completed").and_then(|x| x.as_bool())
}

#[tauri::command]
pub(crate) fn complete_onboarding(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<FrontendState, String> {
    {
        let mut settings = state
            .settings
            .lock()
            .map_err(|_| "No se pudo bloquear settings".to_string())?;
        settings.onboarding_completed = true;
        save_settings_file(&app, &settings)?;
    }
    let out = crate::build_frontend_state(&app, &state)?;
    let _ = app.emit("frontend_state_changed", ());
    Ok(out)
}
