mod audio;
mod clipboard;
mod db;
mod hotkey;
mod llm;
mod modes;
mod overlay;
mod pipeline;
mod secrets;
mod settings;
mod transcription;

use serde::Serialize;
use sqlx::SqlitePool;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;
use tauri::menu::MenuItem;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use whisper_rs::WhisperContext;

use crate::audio::{initialize_audio_device, list_input_devices_or_empty};
use crate::clipboard::copy_to_clipboard;
use crate::db::{clear_history, get_history, init_db};
use crate::hotkey::{map_shortcut_register_error, parse_shortcut, unregister_escape_shortcut};
use crate::llm::{prewarm_groq, test_groq};
use crate::modes::{next_mode, set_mode, update_mode, validate_model, ModeInfo};
use crate::overlay::{
    close_explain_window, emit_dictation_processing, hide_overlay, setup_tray,
    show_mode_change_overlay,
};
use crate::pipeline::{
    do_start_recording, do_stop_recording, process_hotkey_release, start_recording, stop_recording,
};
use crate::secrets::{
    load_deepgram_api_key, load_groq_api_key, redeem_groq_coupon, save_deepgram_api_key,
    save_groq_api_key, test_deepgram,
};
use crate::settings::{
    complete_onboarding, load_settings_file, read_onboarding_completed_from_disk,
    save_settings_file, AppSettings, SaveSettingsInput,
};
use crate::transcription::initialize_whisper;

pub(crate) const WHISPER_MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
pub(crate) const WHISPER_MODEL_FILE: &str = "ggml-base.bin";
pub(crate) const WHISPER_SAMPLE_RATE: u32 = 16_000;
pub(crate) const DEFAULT_HOTKEY: &str = "Ctrl+Space";
pub(crate) const DEFAULT_MODE_HOTKEY: &str = "Ctrl+Shift+M";
pub(crate) const DEFAULT_PAUSE_HOTKEY: &str = "Ctrl+Shift+P";
/// Antes del cambio por compatibilidad con 1Password (Ctrl+Shift+Space).
pub(crate) const LEGACY_DEFAULT_MODE_HOTKEY: &str = "Ctrl+Shift+Space";
pub(crate) const DEFAULT_MODEL: &str = "llama-3.1-8b-instant";
pub(crate) const ALLOWED_GROQ_MODELS: [&str; 2] =
    ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];
pub(crate) const GROQ_STT_MODEL: &str = "whisper-large-v3-turbo";
pub(crate) const GROQ_STT_ENDPOINT: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
pub(crate) const GROQ_CHAT_ENDPOINT: &str = "https://api.groq.com/openai/v1/chat/completions";
pub(crate) const DEEPGRAM_WS_URL: &str = "wss://api.deepgram.com/v1/listen";
pub(crate) const DEEPGRAM_MODEL: &str = "nova-3";
/// Bajo este umbral, soltar la hotkey se interpreta como tap (entra/sale de hands-off).
/// Sobre el umbral, es push-to-talk: la grabación termina al soltar.
pub(crate) const HANDS_OFF_TAP_THRESHOLD_MS: u128 = 250;

#[derive(Serialize)]
pub(crate) struct FrontendState {
    pub(crate) mode: ModeInfo,
    pub(crate) hotkey: String,
    pub(crate) mode_hotkey: String,
    pub(crate) pause_hotkey: String,
    pub(crate) model: String,
    pub(crate) processing_mode: String,
    pub(crate) transcription_provider: String,
    pub(crate) has_groq_key: bool,
    pub(crate) has_deepgram_key: bool,
    pub(crate) microphones: Vec<String>,
    pub(crate) selected_microphone: Option<String>,
    pub(crate) theme: String,
    pub(crate) sound_effects_enabled: bool,
    pub(crate) sound_effects_volume: f32,
    pub(crate) onboarding_completed: bool,
}

#[derive(Debug, Default)]
pub(crate) struct TranscriptionMetrics {
    pub(crate) backend: &'static str,
    pub(crate) recording_duration_ms: u64,
    pub(crate) capture_ms: u64,
    pub(crate) encode_audio_ms: u64,
    pub(crate) groq_stt_upload_and_transcribe_ms: u64,
    pub(crate) local_whisper_ms: u64,
    pub(crate) audio_duration_ms: u64,
    pub(crate) audio_bytes: usize,
}

pub(crate) struct AudioDevice {
    pub(crate) device: cpal::Device,
    pub(crate) config: cpal::StreamConfig,
    pub(crate) sample_format: cpal::SampleFormat,
    pub(crate) sample_rate: u32,
    pub(crate) channels: u16,
}

pub(crate) struct CapturedAudio {
    pub(crate) samples: Vec<f32>,
    pub(crate) sample_rate: u32,
    pub(crate) channels: u16,
}

impl CapturedAudio {
    pub(crate) fn duration_ms(&self) -> u64 {
        let channels = u64::from(self.channels.max(1));
        let sample_rate = u64::from(self.sample_rate.max(1));
        (self.samples.len() as u64).saturating_mul(1000) / sample_rate / channels
    }
}

pub(crate) struct WhisperState {
    pub(crate) context: Arc<Mutex<WhisperContext>>,
}

pub(crate) struct TrayState {
    pub(crate) mode_item: Mutex<MenuItem<tauri::Wry>>,
}

pub(crate) struct AppState {
    pub(crate) is_recording: AtomicBool,
    /// Incrementa en cada flash de overlay por cambio de modo; evita que un timer viejo oculte tras varios toques.
    pub(crate) mode_overlay_flash_gen: AtomicU64,
    /// `true` cuando ESC pidió cancelar la grabación actual; `process_hotkey_release` lo lee y aborta.
    pub(crate) cancel_requested: AtomicBool,
    /// `true` cuando un tap rápido activó modo hands-off; cualquier release siguiente termina.
    pub(crate) hands_off_active: AtomicBool,
    /// `true` cuando el usuario pausó la grabación con la hotkey de pausa; cpal descarta samples.
    pub(crate) is_paused: AtomicBool,
    /// Marca de tiempo del Press de la hotkey de dictado, para distinguir tap vs hold.
    pub(crate) hotkey_pressed_at: Mutex<Option<Instant>>,
    pub(crate) recording_started_at: Mutex<Option<Instant>>,
    pub(crate) audio_buffer: Mutex<Vec<f32>>,
    pub(crate) audio_device: Mutex<AudioDevice>,
    /// `None` mientras descarga/carga el modelo en segundo plano (no bloquear la ventana al arrancar).
    pub(crate) whisper: Arc<Mutex<Option<WhisperState>>>,
    pub(crate) settings: Mutex<AppSettings>,
    pub(crate) db: SqlitePool,
    pub(crate) llm_client: reqwest::Client,
    /// Respaldo de API key cuando Windows Credential Manager / keyring falla o está vacío.
    pub(crate) secrets_path: PathBuf,
    /// Token de cancelación para abortar la sesión Deepgram WS en curso (ESC).
    pub(crate) streaming_cancel: Mutex<Option<tokio_util::sync::CancellationToken>>,
    /// Sender que el callback de `cpal` usa para empujar samples a la sesión WS.
    pub(crate) streaming_audio_tx: Mutex<Option<tokio::sync::mpsc::Sender<Vec<f32>>>>,
    /// Oneshot para indicar a la sesión WS que mande `Finalize`+`CloseStream` al soltar la tecla.
    pub(crate) streaming_finalize_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    /// Notify que la sesión WS dispara cuando ya no procesará más mensajes (final o cancel).
    pub(crate) streaming_done: Arc<tokio::sync::Notify>,
    /// Texto acumulado de los `is_final` que envía Deepgram durante la sesión actual.
    pub(crate) streaming_final_text: Arc<Mutex<String>>,
}

#[tauri::command]
fn get_frontend_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<FrontendState, String> {
    build_frontend_state(&app, &state)
}

pub(crate) fn build_frontend_state(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<FrontendState, String> {
    let settings = {
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "No se pudo bloquear settings".to_string())?;
        if let Some(done) = read_onboarding_completed_from_disk(app) {
            guard.onboarding_completed = done;
        }
        guard.clone()
    };
    Ok(FrontendState {
        mode: ModeInfo::from(settings.mode),
        hotkey: settings.hotkey,
        mode_hotkey: settings.mode_hotkey,
        pause_hotkey: settings.pause_hotkey,
        model: settings.model,
        processing_mode: settings.processing_mode.as_str().to_string(),
        transcription_provider: settings.transcription_provider.as_str().to_string(),
        has_groq_key: load_groq_api_key(state).is_ok(),
        has_deepgram_key: load_deepgram_api_key(state).is_ok(),
        microphones: list_input_devices_or_empty(),
        selected_microphone: settings.microphone,
        theme: settings.theme.as_str().to_string(),
        sound_effects_enabled: settings.sound_effects_enabled,
        sound_effects_volume: settings.sound_effects_volume,
        onboarding_completed: settings.onboarding_completed,
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
    let parsed_pause = parse_shortcut(&input.pause_hotkey)?;
    if parsed_dictation == parsed_mode {
        return Err(
            "El atajo de dictado y el atajo de cambio de modo deben ser distintos.".to_string(),
        );
    }
    if parsed_pause == parsed_dictation || parsed_pause == parsed_mode {
        return Err(
            "El atajo de pausa debe ser distinto del de dictado y del de cambio de modo."
                .to_string(),
        );
    }
    validate_model(&input.model)?;
    let dictation_hotkey_text = input.hotkey.clone();
    let mode_hotkey_text = input.mode_hotkey.clone();
    let pause_hotkey_text = input.pause_hotkey.clone();
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
    let previous_pause_hotkey = settings.pause_hotkey.clone();
    settings.hotkey = input.hotkey;
    settings.mode_hotkey = input.mode_hotkey;
    settings.pause_hotkey = input.pause_hotkey;
    settings.model = input.model;
    settings.processing_mode = input.processing_mode;
    settings.transcription_provider = input.transcription_provider;
    settings.microphone = input.microphone;
    settings.theme = input.theme;
    settings.sound_effects_enabled = input.sound_effects_enabled;
    settings.sound_effects_volume = input.sound_effects_volume.clamp(0.0_f32, 1.0_f32);
    save_settings_file(&app, &settings)?;
    let target_mic = settings.microphone.clone();
    drop(settings);

    if target_mic != previous_mic {
        if state.is_recording.load(Ordering::Acquire) {
            return Err("No se puede cambiar el micrófono mientras se está grabando.".to_string());
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
    let _ = app
        .global_shortcut()
        .unregister(parse_shortcut(&previous_pause_hotkey)?);
    app.global_shortcut()
        .register(parsed_dictation)
        .map_err(|e| {
            map_shortcut_register_error(e.to_string(), &dictation_hotkey_text, "de dictado")
        })?;
    app.global_shortcut().register(parsed_mode).map_err(|e| {
        map_shortcut_register_error(e.to_string(), &mode_hotkey_text, "de cambio de modo")
    })?;
    if let Err(e) = app.global_shortcut().register(parsed_pause) {
        // Si el atajo de pausa choca con otra app, no bloqueamos el guardado.
        eprintln!(
            "{}",
            map_shortcut_register_error(e.to_string(), &pause_hotkey_text, "de pausa")
        );
    }
    let _ = app.emit(
        "mushu_sound_prefs",
        serde_json::json!({
            "enabled": input.sound_effects_enabled,
            "volume": input.sound_effects_volume.clamp(0.0_f32, 1.0_f32),
        }),
    );
    get_frontend_state(app, state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let state = app.state::<AppState>();
                    let (dictation_shortcut, mode_shortcut, pause_shortcut, current_mode) = {
                        let settings = match state.settings.lock() {
                            Ok(settings) => settings.clone(),
                            Err(_) => return,
                        };
                        let dictation = parse_shortcut(&settings.hotkey).ok();
                        let mode = parse_shortcut(&settings.mode_hotkey).ok();
                        let pause = parse_shortcut(&settings.pause_hotkey).ok();
                        (dictation, mode, pause, settings.mode)
                    };

                    // Pausa: solo actúa durante la grabación. Toggle is_paused y emite evento.
                    if let Some(configured) = pause_shortcut {
                        if configured == *shortcut
                            && event.state() == ShortcutState::Pressed
                            && state.is_recording.load(Ordering::Acquire)
                        {
                            let now_paused = !state.is_paused.load(Ordering::Acquire);
                            state.is_paused.store(now_paused, Ordering::Release);
                            let _ = app.emit("dictation_paused", now_paused);
                            return;
                        }
                    }

                    // ESC cancela la grabación en curso: drop buffer, drop WS, no transcribe, no pega.
                    if let Ok(esc) = parse_shortcut("Escape") {
                        if esc == *shortcut
                            && event.state() == ShortcutState::Pressed
                            && state.is_recording.load(Ordering::Acquire)
                        {
                            state.cancel_requested.store(true, Ordering::Release);
                            state.is_recording.store(false, Ordering::Release);
                            if state.is_paused.swap(false, Ordering::AcqRel) {
                                let _ = app.emit("dictation_paused", false);
                            }
                            if state.hands_off_active.swap(false, Ordering::AcqRel) {
                                let _ = app.emit("hands_off_changed", false);
                            }
                            // Cancelar sesión Deepgram si existe.
                            if let Ok(mut g) = state.streaming_cancel.lock() {
                                if let Some(tok) = g.take() {
                                    tok.cancel();
                                }
                            }
                            if let Ok(mut g) = state.streaming_audio_tx.lock() {
                                *g = None;
                            }
                            if let Ok(mut g) = state.streaming_finalize_tx.lock() {
                                *g = None;
                            }
                            if let Ok(mut buf) = state.audio_buffer.lock() {
                                buf.clear();
                            }
                            if let Ok(mut buf) = state.streaming_final_text.lock() {
                                buf.clear();
                            }
                            unregister_escape_shortcut(app);
                            emit_dictation_processing(app, false);
                            let _ = app.emit("dictation_cancelled", ());
                            let _ = hide_overlay(app);
                            return;
                        }
                    }

                    if let Some(configured) = dictation_shortcut {
                        if configured == *shortcut {
                            match event.state() {
                                ShortcutState::Pressed => {
                                    if let Ok(mut g) = state.hotkey_pressed_at.lock() {
                                        *g = Some(Instant::now());
                                    }
                                    if !state.is_recording.load(Ordering::Acquire) {
                                        let _ = do_start_recording(&state, app);
                                    }
                                    // Si ya estamos grabando (sesión hands-off en curso), el press es solo
                                    // para medir duración del próximo release.
                                }
                                ShortcutState::Released => {
                                    // Si ESC ya canceló, no procesamos nada.
                                    if state.cancel_requested.load(Ordering::Acquire) {
                                        return;
                                    }
                                    let duration_ms = state
                                        .hotkey_pressed_at
                                        .lock()
                                        .ok()
                                        .and_then(|mut g| g.take())
                                        .map(|t| t.elapsed().as_millis())
                                        .unwrap_or(u128::MAX);

                                    let was_hands_off =
                                        state.hands_off_active.load(Ordering::Acquire);

                                    if was_hands_off {
                                        // Cualquier release durante hands-off termina y finaliza.
                                        state.hands_off_active.store(false, Ordering::Release);
                                        let _ = app.emit("hands_off_changed", false);
                                        emit_dictation_processing(app, true);
                                        let _ = do_stop_recording(&state, app);
                                        process_hotkey_release(app);
                                    } else if duration_ms < HANDS_OFF_TAP_THRESHOLD_MS {
                                        // Tap rápido sin estar en hands-off: entra a hands-off, no detiene.
                                        state.hands_off_active.store(true, Ordering::Release);
                                        let _ = app.emit("hands_off_changed", true);
                                    } else {
                                        // Hold normal: push-to-talk.
                                        emit_dictation_processing(app, true);
                                        let _ = do_stop_recording(&state, app);
                                        process_hotkey_release(app);
                                    }
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
            let settings = load_settings_file(&app_handle);
            let audio_device = initialize_audio_device(settings.microphone.as_deref())?;
            let data_dir = app_handle
                .path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())?;
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            if let Err(e) = save_settings_file(&app_handle, &settings) {
                eprintln!("[mushu] no se pudo inicializar settings.json: {e}");
            }
            let secrets_path = data_dir.join("secrets.json");
            let whisper: Arc<Mutex<Option<WhisperState>>> = Arc::new(Mutex::new(None));
            let db = tauri::async_runtime::block_on(init_db(&app_handle))?;
            let state = AppState {
                is_recording: AtomicBool::new(false),
                mode_overlay_flash_gen: AtomicU64::new(0),
                cancel_requested: AtomicBool::new(false),
                hands_off_active: AtomicBool::new(false),
                is_paused: AtomicBool::new(false),
                hotkey_pressed_at: Mutex::new(None),
                recording_started_at: Mutex::new(None),
                audio_buffer: Mutex::new(Vec::new()),
                audio_device: Mutex::new(audio_device),
                whisper: whisper.clone(),
                settings: Mutex::new(settings.clone()),
                db,
                llm_client: reqwest::Client::new(),
                secrets_path,
                streaming_cancel: Mutex::new(None),
                streaming_audio_tx: Mutex::new(None),
                streaming_finalize_tx: Mutex::new(None),
                streaming_done: Arc::new(tokio::sync::Notify::new()),
                streaming_final_text: Arc::new(Mutex::new(String::new())),
            };
            app.manage(state);
            prewarm_groq(app_handle.clone());
            {
                let app_for_whisper = app_handle.clone();
                let whisper_slot = whisper.clone();
                thread::spawn(move || match initialize_whisper(&app_for_whisper) {
                    Ok(loaded) => {
                        if let Ok(mut slot) = whisper_slot.lock() {
                            *slot = Some(loaded);
                        }
                        eprintln!("[mushu] whisper listo");
                    }
                    Err(err) => {
                        eprintln!("[mushu] no se pudo inicializar whisper: {err}");
                    }
                });
            }
            setup_tray(&app_handle, settings.mode)?;

            let dictation_parsed = parse_shortcut(&settings.hotkey)?;
            if let Err(e) = app.handle().global_shortcut().register(dictation_parsed) {
                // No bloqueamos el arranque si el atajo de dictado está ocupado por otra app.
                let msg =
                    map_shortcut_register_error(e.to_string(), &settings.hotkey, "de dictado");
                eprintln!("{msg}");
            }
            let mode_parsed = parse_shortcut(&settings.mode_hotkey)?;
            if let Err(e) = app.handle().global_shortcut().register(mode_parsed) {
                // No bloqueamos el arranque si el atajo de cambio de modo está ocupado por otra app.
                let msg = map_shortcut_register_error(
                    e.to_string(),
                    &settings.mode_hotkey,
                    "de cambio de modo",
                );
                eprintln!("{msg}");
            }
            let pause_parsed = parse_shortcut(&settings.pause_hotkey)?;
            if let Err(e) = app.handle().global_shortcut().register(pause_parsed) {
                let msg =
                    map_shortcut_register_error(e.to_string(), &settings.pause_hotkey, "de pausa");
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
            save_deepgram_api_key,
            redeem_groq_coupon,
            test_groq,
            test_deepgram,
            get_history,
            clear_history,
            copy_to_clipboard,
            set_mode,
            close_explain_window,
            complete_onboarding
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
