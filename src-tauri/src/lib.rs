use chrono::Utc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::error::Error;
use std::fs::{self, File};
use std::io::copy;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::{thread, vec};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use unicode_normalization::UnicodeNormalization;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const WHISPER_MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const WHISPER_MODEL_FILE: &str = "ggml-base.bin";
const WHISPER_SAMPLE_RATE: u32 = 16_000;
const DEFAULT_HOTKEY: &str = "Ctrl+Space";
const DEFAULT_MODE_HOTKEY: &str = "Ctrl+Shift+Space";
const DEFAULT_MODEL: &str = "llama-3.1-8b-instant";
const ALLOWED_GROQ_MODELS: [&str; 2] = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];
const KEYRING_SERVICE: &str = "com.antonio.mushu";
const KEYRING_USER: &str = "groq_api_key";
static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum ProcessingMode {
    CloudFirst,
    LocalOnly,
}

impl ProcessingMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::CloudFirst => "cloud_first",
            Self::LocalOnly => "local_only",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum Mode {
    Default,
    Email,
    Formal,
    Casual,
    Code,
    /// Preguntas solo sobre la app Mushu (cualquier dictado → asistente, sin pegar).
    Help,
    /// Portapapeles = mensaje en inglés (p. ej. Reddit) + voz con instrucción → respuesta en inglés pegada.
    ReplyEn,
    /// Traduce portapapeles (o el dictado si no hay copia) al español; resultado en overlay + portapapeles.
    Translate,
}

impl Mode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Default => "DEFAULT",
            Self::Email => "EMAIL",
            Self::Formal => "FORMAL",
            Self::Casual => "CASUAL",
            Self::Code => "CODE",
            Self::Help => "HELP",
            Self::ReplyEn => "REPLY_EN",
            Self::Translate => "TRANSLATE",
        }
    }

    fn color(self) -> &'static str {
        match self {
            Self::Default => "#FFFFFF",
            Self::Email => "#3B82F6",
            Self::Formal => "#8B5CF6",
            Self::Casual => "#10B981",
            Self::Code => "#F59E0B",
            Self::Help => "#F472B6",
            Self::ReplyEn => "#38BDF8",
            Self::Translate => "#A78BFA",
        }
    }

    fn icon(self) -> &'static str {
        match self {
            Self::Default => "Mic",
            Self::Email => "Mail",
            Self::Formal => "BriefcaseBusiness",
            Self::Casual => "MessageCircle",
            Self::Code => "Code2",
            Self::Help => "CircleHelp",
            Self::ReplyEn => "MessageSquareReply",
            Self::Translate => "Languages",
        }
    }
}

#[derive(Clone, Serialize)]
struct ModeInfo {
    /// Identificador estable (DEFAULT, EMAIL, …).
    name: String,
    /// Etiqueta corta en español para la UI ("Modo correo", …).
    label: String,
    color: String,
    icon: String,
}

impl From<Mode> for ModeInfo {
    fn from(value: Mode) -> Self {
        let label = match value {
            Mode::Default => "Modo general",
            Mode::Email => "Modo correo",
            Mode::Formal => "Modo formal",
            Mode::Casual => "Modo casual",
            Mode::Code => "Modo código",
            Mode::Help => "Modo ayuda",
            Mode::ReplyEn => "Modo responder (EN)",
            Mode::Translate => "Modo traducir",
        };
        Self {
            name: value.as_str().to_string(),
            label: label.to_string(),
            color: value.color().to_string(),
            icon: value.icon().to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppSettings {
    hotkey: String,
    #[serde(default = "default_mode_hotkey")]
    mode_hotkey: String,
    model: String,
    #[serde(default)]
    processing_mode: ProcessingMode,
    mode: Mode,
    microphone: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.to_string(),
            mode_hotkey: default_mode_hotkey(),
            model: DEFAULT_MODEL.to_string(),
            processing_mode: ProcessingMode::CloudFirst,
            mode: Mode::Default,
            microphone: None,
        }
    }
}

impl Default for ProcessingMode {
    fn default() -> Self {
        Self::CloudFirst
    }
}

fn default_mode_hotkey() -> String {
    DEFAULT_MODE_HOTKEY.to_string()
}

#[derive(Serialize)]
struct FrontendState {
    mode: ModeInfo,
    hotkey: String,
    mode_hotkey: String,
    model: String,
    processing_mode: String,
    has_groq_key: bool,
    microphones: Vec<String>,
    selected_microphone: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
struct HistoryItem {
    id: i64,
    timestamp: String,
    raw_text: String,
    processed_text: String,
    mode_used: String,
    duration_ms: i64,
}

#[derive(Deserialize)]
struct SaveSettingsInput {
    hotkey: String,
    mode_hotkey: String,
    model: String,
    processing_mode: ProcessingMode,
    microphone: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct GroqMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct GroqRequest {
    model: String,
    temperature: f32,
    messages: Vec<GroqMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct GroqChoice {
    message: GroqMessage,
}

#[derive(Deserialize)]
struct GroqResponse {
    choices: Vec<GroqChoice>,
}

struct AudioDevice {
    device: cpal::Device,
    config: cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    sample_rate: u32,
    channels: u16,
}

struct WhisperState {
    context: Arc<Mutex<WhisperContext>>,
}

struct TrayState {
    mode_item: Mutex<MenuItem<tauri::Wry>>,
}

struct AppState {
    is_recording: AtomicBool,
    /// Incrementa en cada flash de overlay por cambio de modo; evita que un timer viejo oculte tras varios toques.
    mode_overlay_flash_gen: AtomicU64,
    recording_started_at: Mutex<Option<Instant>>,
    audio_buffer: Mutex<Vec<f32>>,
    audio_device: Mutex<AudioDevice>,
    whisper: WhisperState,
    settings: Mutex<AppSettings>,
    db: SqlitePool,
    llm_client: reqwest::Client,
    /// Respaldo de API key cuando Windows Credential Manager / keyring falla o está vacío.
    secrets_path: PathBuf,
}

#[tauri::command]
fn start_recording(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    do_start_recording(&state, &app)
}

#[tauri::command]
fn stop_recording(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<usize, String> {
    do_stop_recording(&state, &app)
}

#[tauri::command]
fn get_frontend_state(state: tauri::State<'_, AppState>) -> Result<FrontendState, String> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| "No se pudo bloquear settings".to_string())?
        .clone();
    Ok(FrontendState {
        mode: ModeInfo::from(settings.mode),
        hotkey: settings.hotkey,
        mode_hotkey: settings.mode_hotkey,
        model: settings.model,
        processing_mode: settings.processing_mode.as_str().to_string(),
        has_groq_key: load_groq_api_key(&state).is_ok(),
        microphones: list_input_devices()?,
        selected_microphone: settings.microphone,
    })
}

#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: SaveSettingsInput,
) -> Result<FrontendState, String> {
    let parsed_dictation = parse_shortcut(&input.hotkey)?;
    let parsed_mode = parse_shortcut(&input.mode_hotkey)?;
    if parsed_dictation == parsed_mode {
        return Err("El atajo de dictado y el atajo de cambio de modo deben ser distintos.".to_string());
    }
    validate_model(&input.model)?;
    let dictation_hotkey_text = input.hotkey.clone();
    let mode_hotkey_text = input.mode_hotkey.clone();
    let previous_mic = {
        let settings = state
            .settings
            .lock()
            .map_err(|_| "No se pudo bloquear settings".to_string())?;
        settings.microphone.clone()
    };

    let mut settings = state
        .settings
        .lock()
        .map_err(|_| "No se pudo bloquear settings".to_string())?;
    let previous_hotkey = settings.hotkey.clone();
    let previous_mode_hotkey = settings.mode_hotkey.clone();
    settings.hotkey = input.hotkey;
    settings.mode_hotkey = input.mode_hotkey;
    settings.model = input.model;
    settings.processing_mode = input.processing_mode;
    settings.microphone = input.microphone;
    save_settings_file(&app, &settings)?;
    let target_mic = settings.microphone.clone();
    drop(settings);

    if target_mic != previous_mic {
        if state.is_recording.load(Ordering::Acquire) {
            return Err(
                "No se puede cambiar el micrófono mientras se está grabando.".to_string(),
            );
        }
        let next_audio = initialize_audio_device(target_mic.as_deref())?;
        let mut audio = state
            .audio_device
            .lock()
            .map_err(|_| "No se pudo bloquear audio_device".to_string())?;
        *audio = next_audio;
    }

    app.global_shortcut()
        .unregister(parse_shortcut(&previous_hotkey)?)
        .map_err(|e| e.to_string())?;
    app.global_shortcut()
        .unregister(parse_shortcut(&previous_mode_hotkey)?)
        .map_err(|e| e.to_string())?;
    app.global_shortcut()
        .register(parsed_dictation)
        .map_err(|e| {
            map_shortcut_register_error(e.to_string(), &dictation_hotkey_text, "de dictado")
        })?;
    app.global_shortcut()
        .register(parsed_mode)
        .map_err(|e| {
            map_shortcut_register_error(
                e.to_string(),
                &mode_hotkey_text,
                "de cambio de modo",
            )
        })?;
    get_frontend_state(state)
}

#[tauri::command]
fn save_groq_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        return Err("La API key no puede estar vacía.".to_string());
    }
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("secrets.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let payload = serde_json::json!({ "groq_api_key": &trimmed });
    fs::write(
        &path,
        serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.set_password(&trimmed);
    }
    Ok(())
}

#[tauri::command]
async fn get_history(state: tauri::State<'_, AppState>) -> Result<Vec<HistoryItem>, String> {
    sqlx::query_as::<_, HistoryItem>(
        "SELECT id, timestamp, raw_text, processed_text, mode_used, duration_ms
         FROM transcription_history
         ORDER BY id DESC LIMIT 20",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_history(state: tauri::State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM transcription_history")
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

fn do_start_recording(state: &AppState, app: &tauri::AppHandle) -> Result<(), String> {
    if state.is_recording.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    *state
        .recording_started_at
        .lock()
        .map_err(|_| "No se pudo bloquear recording_started_at".to_string())? = Some(Instant::now());
    state
        .audio_buffer
        .lock()
        .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?
        .clear();

    let mode = state
        .settings
        .lock()
        .map_err(|_| "No se pudo bloquear settings".to_string())?
        .mode;

    emit_dictation_processing(app, false);
    let _ = app.emit("recording_started", ModeInfo::from(mode));
    let _ = show_overlay(app);

    let app_for_audio = app.clone();
    thread::spawn(move || {
        if let Err(error) = record_audio(app_for_audio.clone()) {
            eprintln!("audio recording error: {error}");
            if let Some(state) = app_for_audio.try_state::<AppState>() {
                state.is_recording.store(false, Ordering::Release);
            }
            let _ = app_for_audio.emit("recording_error", error);
        }
    });

    Ok(())
}

fn do_stop_recording(state: &AppState, app: &tauri::AppHandle) -> Result<usize, String> {
    state.is_recording.store(false, Ordering::Release);
    let audio_len = state
        .audio_buffer
        .lock()
        .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?
        .len();
    let _ = app.emit("recording_stopped", audio_len);
    Ok(audio_len)
}

fn process_hotkey_release(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_handle.state::<AppState>();
        let duration_ms = state
            .recording_started_at
            .lock()
            .ok()
            .and_then(|mut v| v.take())
            .map(|start| start.elapsed().as_millis() as i64)
            .unwrap_or(0);

        let raw_text = match transcribe_audio(&state) {
            Ok(text) => text,
            Err(e) => {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit("transcription_error", e);
                let _ = hide_overlay(&app_handle);
                return;
            }
        };
        if raw_text.is_empty() {
            emit_dictation_processing(&app_handle, false);
            let _ = hide_overlay(&app_handle);
            return;
        }

        let settings = match state.settings.lock() {
            Ok(s) => s.clone(),
            Err(_) => {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit("transcription_error", "No se pudo leer settings");
                let _ = hide_overlay(&app_handle);
                return;
            }
        };

        if settings.processing_mode == ProcessingMode::LocalOnly
            && (settings.mode == Mode::Help
                || settings.mode == Mode::ReplyEn
                || settings.mode == Mode::Translate)
        {
            emit_dictation_processing(&app_handle, false);
            let _ = app_handle.emit(
                "transcription_error",
                "Este modo requiere nube (Groq). Cambia 'Modo de procesamiento' a 'Nube primero'.",
            );
            let _ = hide_overlay(&app_handle);
            return;
        }

        if settings.mode == Mode::Help {
            match mushu_assistant_reply(&state, &raw_text).await {
                Ok(reply) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit(
                        "mushu_reply",
                        serde_json::json!({ "text": reply }),
                    );
                    let _ = save_history(
                        &state.db,
                        &raw_text,
                        &reply,
                        settings.mode.as_str(),
                        duration_ms,
                    )
                    .await;
                    tokio::time::sleep(Duration::from_secs(7)).await;
                }
                Err(err) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit("groq_error", err);
                }
            }
            let _ = hide_overlay(&app_handle);
            return;
        }

        if settings.mode == Mode::ReplyEn {
            let clip_full = match read_clipboard_text() {
                Ok(c) => c,
                Err(e) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit(
                        "transcription_error",
                        format!("No se leyó el portapapeles: {e}"),
                    );
                    let _ = hide_overlay(&app_handle);
                    return;
                }
            };
            let clip = truncate_for_groq(clip_full.trim());
            if clip.is_empty() {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit(
                    "transcription_error",
                    "Copia primero el texto en inglés (Ctrl+C), luego dicta cómo quieres responder.",
                );
                let _ = hide_overlay(&app_handle);
                return;
            }
            match groq_english_reply_from_clipboard(&state, &settings.model, &clip, &raw_text).await {
                Ok(processed_text) => {
                    if let Err(e) = paste_text(&processed_text) {
                        emit_dictation_processing(&app_handle, false);
                        let _ = app_handle.emit("transcription_error", e);
                        let _ = hide_overlay(&app_handle);
                        return;
                    }
                    let raw_for_db = format!(
                        "(contexto EN, {} chars)\n{}\n\n(voz)\n{}",
                        clip.chars().count(),
                        clip.chars().take(2500).collect::<String>(),
                        raw_text
                    );
                    let _ = save_history(
                        &state.db,
                        &raw_for_db,
                        &processed_text,
                        settings.mode.as_str(),
                        duration_ms,
                    )
                    .await;
                    emit_dictation_processing(&app_handle, false);
                    let payload = serde_json::json!({
                        "text": processed_text,
                        "mode": ModeInfo::from(settings.mode),
                    });
                    let _ = app_handle.emit("transcription_done", payload);
                    tokio::time::sleep(Duration::from_millis(2000)).await;
                }
                Err(err) => {
                    let _ = app_handle.emit("groq_error", &err);
                    emit_dictation_processing(&app_handle, false);
                }
            }
            let _ = hide_overlay(&app_handle);
            return;
        }

        if settings.mode == Mode::Translate {
            let source = truncate_for_groq(raw_text.trim());
            if source.trim().is_empty() {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit(
                    "transcription_error",
                    "Dicta el texto que quieres traducir al español.",
                );
                let _ = hide_overlay(&app_handle);
                return;
            }
            match groq_translate_to_spanish(&state, &settings.model, &source).await {
                Ok(translated) => {
                    if let Err(e) = copy_text_only(&translated) {
                        emit_dictation_processing(&app_handle, false);
                        let _ = app_handle.emit("transcription_error", e);
                        let _ = hide_overlay(&app_handle);
                        return;
                    }
                    let _ = save_history(
                        &state.db,
                        &raw_text,
                        &translated,
                        settings.mode.as_str(),
                        duration_ms,
                    )
                    .await;
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit(
                        "mushu_reply",
                        serde_json::json!({ "text": translated }),
                    );
                    tokio::time::sleep(Duration::from_secs(7)).await;
                }
                Err(err) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit("groq_error", err);
                }
            }
            let _ = hide_overlay(&app_handle);
            return;
        }

        if let Some(question) = detect_pregunta_mushu(&raw_text) {
            if settings.processing_mode == ProcessingMode::LocalOnly {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit(
                    "transcription_error",
                    "Pregunta Mushu requiere nube (Groq). Activa 'Nube primero' para usarlo.",
                );
                let _ = hide_overlay(&app_handle);
                return;
            }
            match mushu_assistant_reply(&state, &question).await {
                Ok(reply) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit(
                        "mushu_reply",
                        serde_json::json!({ "text": reply }),
                    );
                    tokio::time::sleep(Duration::from_secs(7)).await;
                }
                Err(err) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit("groq_error", err);
                }
            }
            let _ = hide_overlay(&app_handle);
            return;
        }

        let processed_text = match settings.processing_mode {
            ProcessingMode::CloudFirst => {
                match transform_with_mode(&state, settings.mode, &settings.model, &raw_text).await {
                    Ok(text) => text,
                    Err(err) => {
                        let _ = app_handle.emit(
                            "groq_error",
                            format!("{err}. Fallback local aplicado (texto sin transformación)."),
                        );
                        raw_text.clone()
                    }
                }
            }
            ProcessingMode::LocalOnly => raw_text.clone(),
        };

        if let Err(e) = paste_text(&processed_text) {
            emit_dictation_processing(&app_handle, false);
            let _ = app_handle.emit("transcription_error", e);
            let _ = hide_overlay(&app_handle);
            return;
        }

        let _ = save_history(
            &state.db,
            &raw_text,
            &processed_text,
            settings.mode.as_str(),
            duration_ms,
        )
        .await;

        emit_dictation_processing(&app_handle, false);
        let payload = serde_json::json!({
            "text": processed_text,
            "mode": ModeInfo::from(settings.mode),
        });
        let _ = app_handle.emit("transcription_done", payload);
        tokio::time::sleep(Duration::from_millis(2000)).await;
        let _ = hide_overlay(&app_handle);
    });
}

fn transcribe_audio(state: &AppState) -> Result<String, String> {
    let audio = {
        let mut buf = state
            .audio_buffer
            .lock()
            .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?;
        std::mem::take(&mut *buf)
    };
    if audio.is_empty() {
        return Ok(String::new());
    }
    let (sample_rate, channels) = {
        let device = state
            .audio_device
            .lock()
            .map_err(|_| "No se pudo bloquear audio_device".to_string())?;
        (device.sample_rate, device.channels)
    };
    let whisper_audio = prepare_audio_for_whisper(&audio, sample_rate, channels);
    let context = state
        .whisper
        .context
        .lock()
        .map_err(|_| "No se pudo bloquear WhisperContext".to_string())?;
    let mut w_state = context
        .create_state()
        .map_err(|error| format!("No se pudo crear WhisperState: {error}"))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("es"));
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    w_state
        .full(params, &whisper_audio)
        .map_err(|error| format!("Whisper fallo al transcribir: {error}"))?;
    let mut text = String::new();
    for segment in w_state.as_iter() {
        text.push_str(&segment.to_string());
    }
    Ok(text.trim().to_string())
}

async fn transform_with_mode(
    state: &AppState,
    mode: Mode,
    model: &str,
    raw_text: &str,
) -> Result<String, String> {
    validate_model(model)?;
    let key = load_groq_api_key(state)?;
    let prompt = format!(
        "{}\n\nTexto: {}\n\nDevuelve ÚNICAMENTE el texto transformado, sin explicaciones, sin comillas, sin prefijos.",
        mode_prompt(mode),
        raw_text
    );
    let req = GroqRequest {
        model: model.to_string(),
        temperature: 0.2,
        messages: vec![
            GroqMessage {
                role: "system".to_string(),
                content: "Eres un asistente experto en reescritura de texto en español.".to_string(),
            },
            GroqMessage {
                role: "user".to_string(),
                content: prompt,
            },
        ],
        max_tokens: None,
    };
    let response = tokio::time::timeout(
        Duration::from_secs(5),
        state
            .llm_client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(key)
            .json(&req)
            .send(),
    )
    .await
    .map_err(|_| "Timeout de Groq".to_string())?
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;
    let parsed: GroqResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| raw_text.to_string()))
}

/// Una llamada mínima para comprobar API key, red y nombre de modelo en el dashboard de Groq.
#[tauri::command]
async fn test_groq(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let key = load_groq_api_key(&state)?;
    let model = state
        .settings
        .lock()
        .map_err(|_| "No se pudo bloquear settings".to_string())?
        .model
        .clone();
    validate_model(&model)?;
    let req = GroqRequest {
        model: model.clone(),
        temperature: 0.0,
        messages: vec![GroqMessage {
            role: "user".to_string(),
            content: "Responde solo: OK".to_string(),
        }],
        max_tokens: None,
    };
    let response = tokio::time::timeout(
        Duration::from_secs(5),
        state
            .llm_client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(key)
            .json(&req)
            .send(),
    )
    .await
    .map_err(|_| "Timeout de Groq".to_string())?
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;
    let parsed: GroqResponse = response.json().await.map_err(|e| e.to_string())?;
    let reply = parsed
        .choices
        .first()
        .map(|c| c.message.content.trim())
        .unwrap_or("");
    Ok(format!("Groq respondió correctamente (modelo {model}). Vista previa: {reply}"))
}

fn mode_prompt(mode: Mode) -> &'static str {
    match mode {
        Mode::Default => "Corrige puntuación y elimina muletillas, sin cambiar el estilo original.",
        Mode::Email => {
            "Transforma el texto en un correo electrónico profesional en español. Estructura obligatoria: \
             primera línea 'Asunto: ...' (asunto breve y claro), luego línea en blanco, \
             saludo formal tipo 'Estimado/a ...', cuerpo en párrafos cortos, cierre cordial \
             (p. ej. 'Quedo atento/a a cualquier comentario.') y despedida con nombre si no hay firma explícita."
        }
        Mode::Formal => {
            "Reescribe en tono formal profesional, sin contracciones, con frases bien estructuradas."
        }
        Mode::Casual => {
            "Reescribe en tono casual y conversacional, natural como mensaje de chat en español."
        }
        Mode::Code => {
            "Convierte la instrucción hablada en descripción técnica clara o comentario de código."
        }
        Mode::Help | Mode::ReplyEn | Mode::Translate => {
            "Este modo se procesa en un flujo dedicado; no uses esta plantilla."
        }
    }
}

fn strip_whisper_brackets(text: &str) -> String {
    let mut depth = 0i32;
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        if ch == '[' {
            depth += 1;
            continue;
        }
        if ch == ']' {
            depth = (depth - 1).max(0);
            continue;
        }
        if depth == 0 {
            out.push(ch);
        }
    }
    out
}

/// Normaliza para detectar comandos de voz aunque Whisper meta guiones, puntuación o ruido.
fn normalize_for_triggers(text: &str) -> String {
    let base = strip_whisper_brackets(text);
    let mut s = normalize_text(&base);
    s = s.replace(['*', '_'], " ");
    s = s.replace("e-mail", "email");
    s = s.replace("e mail", "email");
    for ch in ['.', ',', '!', '?', '¡', '¿', ':', ';', '"', '\''] {
        s = s.replace(ch, " ");
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_text(text: &str) -> String {
    text.to_lowercase()
        .nfd()
        .filter(|c| !('\u{0300}'..='\u{036f}').contains(c))
        .collect::<String>()
}

/// "Pregunta Mushu, ..." → pregunta para el asistente (sin pegar en el foco actual).
fn detect_pregunta_mushu(text: &str) -> Option<String> {
    let n = normalize_for_triggers(text);
    const NEEDLES: &[&str] = &[
        "pregunta mushu",
        "pregunta a mushu",
        "oye mushu",
        "hey mushu",
    ];
    for needle in NEEDLES {
        if let Some(idx) = n.find(needle) {
            let rest = n[idx + needle.len()..].trim();
            let q = if rest.is_empty() {
                "¿Qué modos tiene Mushu y cómo cambio de modo con el teclado? Responde en pocas frases."
                    .to_string()
            } else {
                rest.to_string()
            };
            return Some(q);
        }
    }
    None
}

async fn mushu_assistant_reply(state: &AppState, user_question: &str) -> Result<String, String> {
    let key = load_groq_api_key(state)?;
    let model = state
        .settings
        .lock()
        .map_err(|_| "No se pudo bloquear settings".to_string())?
        .model
        .clone();
    validate_model(&model)?;
    const SYSTEM: &str = r#"Eres "Mushu", el asistente de voz de la app Mushu (Windows, Tauri).
Habla en primera persona, en español. Las respuestas deben ser MUY cortas para leer en un vistazo.

FORMATO DE RESPUESTA (obligatorio):
- Como máximo 2 o 3 frases cortas; idealmente menos de 220 caracteres en total.
- Sin listas con viñetas, sin numeraciones largas y sin markdown (nada de #, **, tablas).
- Ve al grano: qué hacer, en qué orden, o la respuesta directa.

CONTEXTO RÁPIDO DE LA APP:
Dictado local con Whisper; Groq puede reescribir según el modo. Modos: general, correo, formal, casual, código, ayuda (preguntas a ti), responder EN (clipboard en inglés + voz), traducir. El modo solo se cambia con el atajo de teclado configurado para “siguiente modo” (por defecto Ctrl+Shift+Espacio), nunca por frases en el dictado.

REGLAS:
- Responde directo a la pregunta; nada de meta-instrucciones ("aquí tienes", "enumera", "devuelve la lista") sin contenido útil.
- Si preguntan qué modos hay, resume en una o dos frases los nombres y para qué sirven, sin ensayar.
- Si no sabes algo, una sola frase honesta."#;
    let user_block = format!(
        "Pregunta del usuario (puede venir de transcripción automática):\n{}",
        user_question.trim()
    );
    let req = GroqRequest {
        model,
        temperature: 0.12,
        messages: vec![
            GroqMessage {
                role: "system".to_string(),
                content: SYSTEM.to_string(),
            },
            GroqMessage {
                role: "user".to_string(),
                content: user_block,
            },
        ],
        max_tokens: Some(110),
    };
    let response = tokio::time::timeout(
        Duration::from_secs(12),
        state
            .llm_client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(key)
            .json(&req)
            .send(),
    )
    .await
    .map_err(|_| "Timeout del asistente Mushu".to_string())?
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;
    let parsed: GroqResponse = response.json().await.map_err(|e| e.to_string())?;
    parsed
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Respuesta vacía del asistente".to_string())
}

fn update_mode(
    app: &tauri::AppHandle,
    state: &AppState,
    mode: Mode,
    persist: bool,
) -> Result<(), String> {
    {
        let mut settings = state
            .settings
            .lock()
            .map_err(|_| "No se pudo bloquear settings".to_string())?;
        settings.mode = mode;
        if persist {
            save_settings_file(app, &settings)?;
        }
    }
    if let Some(tray_state) = app.try_state::<TrayState>() {
        if let Ok(item) = tray_state.mode_item.lock() {
            let _ = item.set_text(format!("Mode: {}", mode.as_str()));
        }
    }
    app.emit("mode_changed", ModeInfo::from(mode))
        .map_err(|e| e.to_string())
}

async fn save_history(
    db: &SqlitePool,
    raw_text: &str,
    processed_text: &str,
    mode_used: &str,
    duration_ms: i64,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO transcription_history(timestamp, raw_text, processed_text, mode_used, duration_ms)
         VALUES(?, ?, ?, ?, ?)",
    )
    .bind(Utc::now().to_rfc3339())
    .bind(raw_text)
    .bind(processed_text)
    .bind(mode_used)
    .bind(duration_ms)
    .execute(db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_shortcut(value: &str) -> Result<Shortcut, String> {
    Shortcut::from_str(value).map_err(|e| format!("Hotkey inválida: {e}"))
}

fn map_shortcut_register_error(raw: String, shortcut_text: &str, label: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("already registered") {
        return format!(
            "No se pudo registrar el atajo {label} ({shortcut_text}) porque ya está en uso por otra app o instancia."
        );
    }
    raw
}

fn validate_model(model: &str) -> Result<(), String> {
    if ALLOWED_GROQ_MODELS.contains(&model) {
        return Ok(());
    }
    Err(format!(
        "Modelo no permitido: {model}. Modelos válidos: {}",
        ALLOWED_GROQ_MODELS.join(", ")
    ))
}

fn next_mode(mode: Mode) -> Mode {
    match mode {
        Mode::Default => Mode::Email,
        Mode::Email => Mode::Formal,
        Mode::Formal => Mode::Casual,
        Mode::Casual => Mode::Code,
        Mode::Code => Mode::Help,
        Mode::Help => Mode::ReplyEn,
        Mode::ReplyEn => Mode::Translate,
        Mode::Translate => Mode::Default,
    }
}

const CLIPBOARD_GROQ_MAX_CHARS: usize = 12_000;

fn read_clipboard_text() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

fn truncate_for_groq(s: &str) -> String {
    let count = s.chars().count();
    if count <= CLIPBOARD_GROQ_MAX_CHARS {
        return s.to_string();
    }
    s.chars().take(CLIPBOARD_GROQ_MAX_CHARS).collect()
}

fn copy_text_only(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_text(text.to_string())
        .map_err(|e| e.to_string())
}

async fn groq_english_reply_from_clipboard(
    state: &AppState,
    model: &str,
    english_context: &str,
    instruction: &str,
) -> Result<String, String> {
    validate_model(model)?;
    let key = load_groq_api_key(state)?;
    const SYSTEM: &str = r#"Eres un redactor nativo de inglés (EE.UU./Reino Unido neutro).
El usuario pega CONTEXT en inglés (p. ej. un post o comentario de Reddit) y dicta en español o inglés CÓMO quiere responder.
Tu salida debe ser ÚNICAMENTE el texto final de la respuesta en inglés, listo para publicar: sin comillas, sin prefijos tipo "Here is", sin explicaciones, sin markdown salvo que pida listas muy breves."#;
    let user = format!(
        "CONTEXT (English):\n---\n{english_context}\n---\n\nInstruction (how to reply; may be Spanish):\n{instruction}\n\nWrite only the English reply body."
    );
    let req = GroqRequest {
        model: model.to_string(),
        temperature: 0.25,
        messages: vec![
            GroqMessage {
                role: "system".to_string(),
                content: SYSTEM.to_string(),
            },
            GroqMessage {
                role: "user".to_string(),
                content: user,
            },
        ],
        max_tokens: None,
    };
    let response = tokio::time::timeout(
        Duration::from_secs(10),
        state
            .llm_client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(key)
            .json(&req)
            .send(),
    )
    .await
    .map_err(|_| "Timeout de Groq (responder EN)".to_string())?
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;
    let parsed: GroqResponse = response.json().await.map_err(|e| e.to_string())?;
    parsed
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Respuesta vacía (inglés)".to_string())
}

async fn groq_translate_to_spanish(
    state: &AppState,
    model: &str,
    text: &str,
) -> Result<String, String> {
    validate_model(model)?;
    let key = load_groq_api_key(state)?;
    const SYSTEM: &str = r#"El usuario dictó un texto (transcripción automática); puede estar en inglés u otro idioma.
Tradúcelo al español natural (España o latino neutro según el original).
Devuelve ÚNICAMENTE la traducción, sin comillas, sin prefijos, sin notas."#;
    let req = GroqRequest {
        model: model.to_string(),
        temperature: 0.15,
        messages: vec![
            GroqMessage {
                role: "system".to_string(),
                content: SYSTEM.to_string(),
            },
            GroqMessage {
                role: "user".to_string(),
                content: text.to_string(),
            },
        ],
        max_tokens: None,
    };
    let response = tokio::time::timeout(
        Duration::from_secs(10),
        state
            .llm_client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(key)
            .json(&req)
            .send(),
    )
    .await
    .map_err(|_| "Timeout de Groq (traducir)".to_string())?
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;
    let parsed: GroqResponse = response.json().await.map_err(|e| e.to_string())?;
    parsed
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Traducción vacía".to_string())
}

fn paste_text(text: &str) -> Result<(), String> {
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

fn groq_key_from_file(secrets_path: &Path) -> Option<String> {
    let raw = fs::read_to_string(secrets_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value
        .get("groq_api_key")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn load_groq_api_key(state: &AppState) -> Result<String, String> {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        match entry.get_password() {
            Ok(k) if !k.trim().is_empty() => return Ok(k.trim().to_string()),
            Ok(_) => {}
            Err(_) => {}
        }
    }
    groq_key_from_file(&state.secrets_path).ok_or_else(|| {
        "No hay API key de Groq guardada. Pégala en Settings, pulsa Guardar y prueba de nuevo.".to_string()
    })
}

fn load_settings_file(app: &tauri::AppHandle) -> AppSettings {
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

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    if parse_shortcut(&settings.hotkey).is_err() {
        settings.hotkey = DEFAULT_HOTKEY.to_string();
    }
    if parse_shortcut(&settings.mode_hotkey).is_err() {
        settings.mode_hotkey = default_mode_hotkey();
    }
    if settings.hotkey == settings.mode_hotkey {
        settings.mode_hotkey = default_mode_hotkey();
        if settings.hotkey == settings.mode_hotkey {
            settings.mode_hotkey = "Ctrl+Alt+Space".to_string();
        }
    }
    if validate_model(&settings.model).is_err() {
        settings.model = DEFAULT_MODEL.to_string();
    }
    settings
}

fn save_settings_file(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app).ok_or_else(|| "No se pudo resolver settings path".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, serialized).map_err(|e| e.to_string())
}

fn settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|p| p.join("settings.json"))
}

fn record_audio(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (device, config, sample_format) = {
        let audio_device = state
            .audio_device
            .lock()
            .map_err(|_| "No se pudo bloquear audio_device".to_string())?;
        (
            audio_device.device.clone(),
            audio_device.config.clone(),
            audio_device.sample_format,
        )
    };
    let app_for_error = app.clone();
    let error_callback = move |error: cpal::StreamError| {
        eprintln!("audio stream error: {error}");
        let _ = app_for_error.emit("recording_error", error.to_string());
    };
    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let app_for_data = app.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _| append_f32_samples(&app_for_data, data),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let app_for_data = app.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _| append_i16_samples(&app_for_data, data),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let app_for_data = app.clone();
            device.build_input_stream(
                &config,
                move |data: &[u16], _| append_u16_samples(&app_for_data, data),
                error_callback,
                None,
            )
        }
        sample_format => {
            return Err(format!("Formato de audio no soportado: {sample_format:?}"));
        }
    }
    .map_err(|error| format!("No se pudo abrir el microfono: {error}"))?;
    stream
        .play()
        .map_err(|error| format!("No se pudo iniciar el microfono: {error}"))?;
    while state.is_recording.load(Ordering::Acquire) {
        thread::sleep(Duration::from_millis(50));
    }
    Ok(())
}

fn append_f32_samples(app: &tauri::AppHandle, data: &[f32]) {
    let state = app.state::<AppState>();
    if !state.is_recording.load(Ordering::Acquire) {
        return;
    }
    if let Ok(mut audio_buffer) = state.audio_buffer.lock() {
        audio_buffer.extend_from_slice(data);
    }
    emit_audio_level(app, data.iter().copied());
}

fn append_i16_samples(app: &tauri::AppHandle, data: &[i16]) {
    let state = app.state::<AppState>();
    if !state.is_recording.load(Ordering::Acquire) {
        return;
    }
    if let Ok(mut audio_buffer) = state.audio_buffer.lock() {
        audio_buffer.extend(data.iter().map(|sample| *sample as f32 / i16::MAX as f32));
    }
    emit_audio_level(app, data.iter().map(|s| *s as f32 / i16::MAX as f32));
}

fn append_u16_samples(app: &tauri::AppHandle, data: &[u16]) {
    let state = app.state::<AppState>();
    if !state.is_recording.load(Ordering::Acquire) {
        return;
    }
    if let Ok(mut audio_buffer) = state.audio_buffer.lock() {
        audio_buffer.extend(
            data.iter()
                .map(|sample| (*sample as f32 - 32768.0) / 32768.0),
        );
    }
    emit_audio_level(
        app,
        data.iter().map(|s| (*s as f32 - 32768.0) / 32768.0),
    );
}

fn emit_audio_level<I: Iterator<Item = f32>>(app: &tauri::AppHandle, samples: I) {
    let mut sum_sq = 0.0f32;
    let mut count = 0u32;
    for sample in samples {
        sum_sq += sample * sample;
        count += 1;
    }
    if count == 0 {
        return;
    }
    let rms = (sum_sq / count as f32).sqrt();
    let _ = app.emit("audio_level", rms);
}

fn prepare_audio_for_whisper(input: &[f32], sample_rate: u32, channels: u16) -> Vec<f32> {
    let mono = mix_to_mono(input, channels);
    if sample_rate == WHISPER_SAMPLE_RATE {
        return mono;
    }
    resample_linear(&mono, sample_rate, WHISPER_SAMPLE_RATE)
}

fn mix_to_mono(input: &[f32], channels: u16) -> Vec<f32> {
    let channel_count = usize::from(channels.max(1));
    if channel_count == 1 {
        return input.to_vec();
    }
    input
        .chunks_exact(channel_count)
        .map(|frame| frame.iter().sum::<f32>() / channel_count as f32)
        .collect()
}

fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if input.is_empty() || from_rate == 0 {
        return Vec::new();
    }
    let output_len = (input.len() as u64 * to_rate as u64 / from_rate as u64) as usize;
    let mut output = Vec::with_capacity(output_len);
    let ratio = from_rate as f64 / to_rate as f64;
    for output_index in 0..output_len {
        let source_position = output_index as f64 * ratio;
        let source_index = source_position.floor() as usize;
        let next_index = (source_index + 1).min(input.len() - 1);
        let fraction = (source_position - source_index as f64) as f32;
        let sample = input[source_index] * (1.0 - fraction) + input[next_index] * fraction;
        output.push(sample);
    }
    output
}

fn list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for device in devices {
        if let Ok(name) = device.name() {
            names.push(name);
        }
    }
    Ok(names)
}

fn initialize_audio_device(preferred_name: Option<&str>) -> Result<AudioDevice, String> {
    let host = cpal::default_host();
    let device = if let Some(name) = preferred_name {
        let mut selected = None;
        let devices = host.input_devices().map_err(|e| e.to_string())?;
        for dev in devices {
            if let Ok(device_name) = dev.name() {
                if device_name == name {
                    selected = Some(dev);
                    break;
                }
            }
        }
        selected.or_else(|| host.default_input_device())
    } else {
        host.default_input_device()
    }
    .ok_or_else(|| "No se encontro un microfono de entrada".to_string())?;
    let supported_config = device
        .default_input_config()
        .map_err(|error| format!("No se pudo leer la configuracion del microfono: {error}"))?;
    let sample_format = supported_config.sample_format();
    let stream_config: cpal::StreamConfig = supported_config.into();
    Ok(AudioDevice {
        device,
        config: stream_config.clone(),
        sample_format,
        sample_rate: stream_config.sample_rate.0,
        channels: stream_config.channels,
    })
}

fn initialize_whisper(app: &tauri::AppHandle) -> Result<WhisperState, Box<dyn Error>> {
    let model_path = ensure_whisper_model(app)?;
    let context =
        WhisperContext::new_with_params(&model_path, WhisperContextParameters::default())?;
    Ok(WhisperState {
        context: Arc::new(Mutex::new(context)),
    })
}

fn ensure_whisper_model(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    let model_path = whisper_model_path(app)?;
    if model_path.exists() && model_path.metadata()?.len() > 0 {
        return Ok(model_path);
    }
    download_whisper_model(&model_path)?;
    Ok(model_path)
}

fn whisper_model_path(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    let data_dir = app.path().app_local_data_dir()?;
    fs::create_dir_all(&data_dir)?;
    Ok(data_dir.join(WHISPER_MODEL_FILE))
}

fn download_whisper_model(model_path: &Path) -> Result<(), Box<dyn Error>> {
    let temp_path = model_path.with_extension("bin.download");
    let mut response = reqwest::blocking::get(WHISPER_MODEL_URL)?.error_for_status()?;
    let mut file = File::create(&temp_path)?;
    copy(&mut response, &mut file)?;
    fs::rename(temp_path, model_path)?;
    Ok(())
}

fn show_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let monitor_size = monitor.size();
            let monitor_pos = monitor.position();
            let outer = window.outer_size().map_err(|e| e.to_string())?;
            let x = monitor_pos.x + (monitor_size.width as i32 - outer.width as i32) / 2;
            let y = monitor_pos.y + monitor_size.height as i32 - outer.height as i32 - 72;
            window
                .set_position(tauri::PhysicalPosition { x, y })
                .map_err(|e| e.to_string())?;
        }
        window.show().map_err(|error| error.to_string())?;
        window
            .set_always_on_top(true)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn hide_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Muestra la píldora (overlay) al cambiar modo con atajo; la oculta tras un breve tiempo si no hay grabación.
fn show_mode_change_overlay(app: &tauri::AppHandle, state: &AppState) {
    emit_dictation_processing(app, false);
    let _ = show_overlay(app);
    emit_overlay_mode_banner(app, true);
    let gen = state
        .mode_overlay_flash_gen
        .fetch_add(1, Ordering::AcqRel)
        .saturating_add(1);
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1800)).await;
        let Some(inner) = app_clone.try_state::<AppState>() else {
            return;
        };
        if inner.mode_overlay_flash_gen.load(Ordering::Acquire) != gen {
            return;
        }
        if inner.is_recording.load(Ordering::Acquire) {
            return;
        }
        let _ = app_clone.emit(
            "overlay_mode_banner",
            serde_json::json!({ "active": false }),
        );
        let _ = hide_overlay(&app_clone);
    });
}

fn emit_dictation_processing(app: &tauri::AppHandle, active: bool) {
    let _ = app.emit(
        "dictation_processing",
        serde_json::json!({ "active": active }),
    );
}

fn emit_overlay_mode_banner(app: &tauri::AppHandle, active: bool) {
    let _ = app.emit(
        "overlay_mode_banner",
        serde_json::json!({ "active": active }),
    );
}

async fn init_db(app: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let db_path = data_dir.join("history.db");
    let connect_options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await
        .map_err(|e| e.to_string())?;
    MIGRATOR.run(&pool).await.map_err(|e| e.to_string())?;
    Ok(pool)
}

fn setup_tray(app: &tauri::AppHandle, mode: Mode) -> Result<(), String> {
    let open_i = MenuItem::with_id(app, "open", "Open", true, None::<&str>).map_err(|e| e.to_string())?;
    let mode_i = MenuItem::with_id(
        app,
        "mode_label",
        format!("Mode: {}", mode.as_str()),
        false,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&open_i, &mode_i, &quit_i]).map_err(|e| e.to_string())?;
    TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(win) = tray.app_handle().get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    app.manage(TrayState {
        mode_item: Mutex::new(mode_i),
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let state = app.state::<AppState>();
                    let (dictation_shortcut, mode_shortcut, current_mode) = {
                        let settings = match state.settings.lock() {
                            Ok(settings) => settings.clone(),
                            Err(_) => return,
                        };
                        let dictation = parse_shortcut(&settings.hotkey).ok();
                        let mode = parse_shortcut(&settings.mode_hotkey).ok();
                        (dictation, mode, settings.mode)
                    };

                    if let Some(configured) = dictation_shortcut {
                        if configured == *shortcut {
                            match event.state() {
                                ShortcutState::Pressed => {
                                    let _ = do_start_recording(&state, app);
                                }
                                ShortcutState::Released => {
                                    // Procesando antes de "recording_stopped": la UI pasa a pensar sin mezclar con la onda.
                                    emit_dictation_processing(app, true);
                                    let _ = do_stop_recording(&state, app);
                                    process_hotkey_release(app);
                                }
                            }
                            return;
                        }
                    }

                    if let Some(configured) = mode_shortcut {
                        if configured == *shortcut && event.state() == ShortcutState::Released {
                            if state.is_recording.load(Ordering::Acquire) {
                                return;
                            }
                            let target_mode = next_mode(current_mode);
                            if let Err(err) = update_mode(app, &state, target_mode, true) {
                                let _ = app.emit("transcription_error", err);
                                return;
                            }
                            show_mode_change_overlay(app, &state);
                            let _ = app.emit("mode_switch_ok", ModeInfo::from(target_mode));
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_handle = app.handle().clone();
            let whisper = initialize_whisper(&app_handle).map_err(|e| e.to_string())?;
            let settings = load_settings_file(&app_handle);
            let audio_device = initialize_audio_device(settings.microphone.as_deref())?;
            let data_dir = app_handle
                .path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())?;
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            let secrets_path = data_dir.join("secrets.json");
            let db = tauri::async_runtime::block_on(init_db(&app_handle))?;
            let state = AppState {
                is_recording: AtomicBool::new(false),
                mode_overlay_flash_gen: AtomicU64::new(0),
                recording_started_at: Mutex::new(None),
                audio_buffer: Mutex::new(Vec::new()),
                audio_device: Mutex::new(audio_device),
                whisper,
                settings: Mutex::new(settings.clone()),
                db,
                llm_client: reqwest::Client::new(),
                secrets_path,
            };
            app.manage(state);
            setup_tray(&app_handle, settings.mode)?;

            app.handle()
                .global_shortcut()
                .register(parse_shortcut(&settings.hotkey)?)
                .map_err(|e| {
                    map_shortcut_register_error(e.to_string(), &settings.hotkey, "de dictado")
                })?;
            let mode_parsed = parse_shortcut(&settings.mode_hotkey)?;
            if let Err(e) = app.handle()
                .global_shortcut()
                .register(mode_parsed)
            {
                // No bloqueamos el arranque si el atajo de cambio de modo está ocupado por otra app.
                let msg = map_shortcut_register_error(
                    e.to_string(),
                    &settings.mode_hotkey,
                    "de cambio de modo",
                );
                eprintln!("{msg}");
            }

            if let Some(main) = app.get_webview_window("main") {
                let main_window = main.clone();
                let _ = main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_window.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_frontend_state,
            save_settings,
            save_groq_api_key,
            test_groq,
            get_history,
            clear_history,
            copy_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
