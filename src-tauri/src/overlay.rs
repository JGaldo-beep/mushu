use enigo::{Enigo, Mouse, Settings};
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

use crate::modes::Mode;
use crate::{AppState, TranscriptionMetrics, TrayState};

pub(crate) const OVERLAY_LABEL: &str = "overlay";

/// Tamaño nominal del overlay (debe coincidir con tauri.conf.json).
const OVERLAY_W: i32 = 440;
const OVERLAY_H: i32 = 112;

pub(crate) fn resolve_overlay_monitor(
    app: &tauri::AppHandle,
    overlay: &tauri::WebviewWindow,
) -> Option<tauri::Monitor> {
    // Con la ventana oculta, `current_monitor()` a veces devuelve None o un monitor que no
    // coincide con donde está el cursor; priorizamos el monitor bajo el puntero.
    if let Ok(enigo) = Enigo::new(&Settings::default()) {
        if let Ok((x, y)) = enigo.location() {
            if let Ok(Some(m)) = overlay.monitor_from_point(x as f64, y as f64) {
                return Some(m);
            }
        }
    }
    if let Ok(Some(m)) = overlay.current_monitor() {
        return Some(m);
    }
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(Some(m)) = main.current_monitor() {
            return Some(m);
        }
    }
    overlay.primary_monitor().ok().flatten()
}

pub(crate) fn show_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "overlay window not found".to_string())?;

    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;

    if let Some(monitor) = resolve_overlay_monitor(app, &window) {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let x = monitor_pos.x + (monitor_size.width as i32 - OVERLAY_W) / 2;
        let y = monitor_pos.y + monitor_size.height as i32 - OVERLAY_H - 72;
        let _ = window.set_position(tauri::PhysicalPosition { x, y });
    }

    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_top(true);

    Ok(())
}

pub(crate) fn hide_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Muestra la píldora (overlay) al cambiar modo con atajo; la oculta tras un breve tiempo si no hay grabación.
pub(crate) fn show_mode_change_overlay(app: &tauri::AppHandle, state: &AppState) {
    emit_dictation_processing(app, false);
    let _ = show_overlay(app);
    emit_overlay_mode_banner(app, true);
    {
        let app_for_overlay = app.clone();
        tauri::async_runtime::spawn(async move {
            for delay_ms in [90_u64, 250, 700] {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                emit_overlay_mode_banner(&app_for_overlay, true);
            }
        });
    }
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

pub(crate) fn emit_dictation_processing(app: &tauri::AppHandle, active: bool) {
    let _ = app.emit(
        "dictation_processing",
        serde_json::json!({ "active": active }),
    );
}

pub(crate) fn emit_mushu_sound_prefs(app: &tauri::AppHandle, state: &AppState) {
    let (enabled, vol) = match state.settings.lock() {
        Ok(s) => (
            s.sound_effects_enabled,
            s.sound_effects_volume.clamp(0.0_f32, 1.0_f32),
        ),
        Err(_) => (true, 0.22_f32),
    };
    let _ = app.emit(
        "mushu_sound_prefs",
        serde_json::json!({ "enabled": enabled, "volume": vol }),
    );
}

/// Tiempos desde que sueltas el atajo hasta cada fase (para medir latencia real).
pub(crate) fn emit_dictation_latency(
    app: &tauri::AppHandle,
    whisper_ms: u64,
    llm_ms: u64,
    paste_ms: u64,
    total_ms: u64,
    phase: &str,
) {
    let _ = app.emit(
        "dictation_latency",
        serde_json::json!({
            "whisper_ms": whisper_ms,
            "llm_ms": llm_ms,
            "paste_ms": paste_ms,
            "total_ms": total_ms,
            "phase": phase,
        }),
    );
}

pub(crate) fn log_pipeline_timing(
    phase: &str,
    transcription: &TranscriptionMetrics,
    llm_ms: u64,
    paste_ms: u64,
    db_save_ms: u64,
    total_ms: u64,
) {
    eprintln!(
        "[mushu:latency] phase={phase} backend={} recording_duration_ms={} audio_duration_ms={} audio_bytes={} capture_audio_ms={} encode_audio_ms={} groq_stt_upload_and_transcribe_ms={} local_whisper_ms={} llm_transform_ms={} clipboard_or_paste_ms={} db_save_ms={} total_release_to_done_ms={}",
        transcription.backend,
        transcription.recording_duration_ms,
        transcription.audio_duration_ms,
        transcription.audio_bytes,
        transcription.capture_ms,
        transcription.encode_audio_ms,
        transcription.groq_stt_upload_and_transcribe_ms,
        transcription.local_whisper_ms,
        llm_ms,
        paste_ms,
        db_save_ms,
        total_ms,
    );
}

pub(crate) fn emit_overlay_mode_banner(app: &tauri::AppHandle, active: bool) {
    let payload = serde_json::json!({ "active": active });
    let _ = app.emit("overlay_mode_banner", payload.clone());
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.emit("overlay_mode_banner", payload);
    }
}

pub(crate) fn emit_explain_event(
    app: &tauri::AppHandle,
    event: &str,
    payload: impl Serialize + Clone,
) {
    if let Some(w) = app.get_webview_window("explain") {
        let _ = w.emit(event, payload);
    }
}

pub(crate) fn show_explain_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("explain")
        .ok_or_else(|| "Ventana explain no encontrada".to_string())?;
    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        window
            .set_size(tauri::PhysicalSize {
                width: monitor_size.width,
                height: monitor_size.height,
            })
            .map_err(|e| e.to_string())?;
        window
            .set_position(tauri::PhysicalPosition {
                x: monitor_pos.x,
                y: monitor_pos.y,
            })
            .map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub(crate) fn close_explain_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("explain") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(crate) fn setup_tray(app: &tauri::AppHandle, mode: Mode) -> Result<(), String> {
    let open_i =
        MenuItem::with_id(app, "open", "Open", true, None::<&str>).map_err(|e| e.to_string())?;
    let mode_i = MenuItem::with_id(
        app,
        "mode_label",
        format!("Mode: {}", mode.as_str()),
        false,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let quit_i =
        MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&open_i, &mode_i, &quit_i]).map_err(|e| e.to_string())?;
    let tray_image = Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .map_err(|e| format!("icono de bandeja: {e}"))?;
    TrayIconBuilder::with_id("main-tray")
        .icon(tray_image)
        .tooltip("Mushu")
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
