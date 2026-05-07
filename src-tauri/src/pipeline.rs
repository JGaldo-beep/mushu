use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

use crate::audio::{capture_audio, record_audio};
use crate::clipboard::{
    paste_text, read_clipboard_text, simulate_copy_selection, truncate_for_groq,
};
use crate::db::save_history;
use crate::hotkey::{register_escape_shortcut, unregister_escape_shortcut};
use crate::llm::{
    groq_english_reply_from_clipboard, groq_explain_stream, mushu_assistant_reply,
    transform_with_mode,
};
use crate::modes::{detect_pregunta_mushu, meaningful_speech_from_whisper, Mode, ModeInfo};
use crate::overlay::{
    emit_dictation_latency, emit_dictation_processing, emit_explain_event, emit_mushu_sound_prefs,
    hide_overlay, log_pipeline_timing, show_explain_window, show_overlay,
};
use crate::secrets::load_deepgram_api_key;
use crate::settings::{ProcessingMode, TranscriptionProvider};
use crate::transcription::{deepgram_stream_session, transcribe_audio};
use crate::{AppState, TranscriptionMetrics};

#[tauri::command]
pub(crate) fn start_recording(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    do_start_recording(&state, &app)
}

#[tauri::command]
pub(crate) fn stop_recording(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    do_stop_recording(&state, &app)
}

pub(crate) fn do_start_recording(state: &AppState, app: &tauri::AppHandle) -> Result<(), String> {
    if state.is_recording.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    *state
        .recording_started_at
        .lock()
        .map_err(|_| "No se pudo bloquear recording_started_at".to_string())? =
        Some(Instant::now());
    state
        .audio_buffer
        .lock()
        .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?
        .clear();
    state.cancel_requested.store(false, Ordering::Release);
    state.hands_off_active.store(false, Ordering::Release);
    state.is_paused.store(false, Ordering::Release);
    if let Ok(mut buf) = state.streaming_final_text.lock() {
        buf.clear();
    }

    let (mode, provider) = {
        let s = state
            .settings
            .lock()
            .map_err(|_| "No se pudo bloquear settings".to_string())?;
        (s.mode, s.transcription_provider)
    };

    // Si Deepgram está activo y hay key, abre WS en background ya — el callback de cpal
    // empezará a empujar samples de inmediato; cualquier sample anterior al handshake
    // se acumula en el canal y se drena al primer write.
    if provider == TranscriptionProvider::Deepgram {
        match load_deepgram_api_key(state) {
            Ok(api_key) => {
                let (sample_rate, channels) = {
                    let device = state
                        .audio_device
                        .lock()
                        .map_err(|_| "No se pudo bloquear audio_device".to_string())?;
                    (device.sample_rate, device.channels)
                };
                let (audio_tx, audio_rx) = tokio::sync::mpsc::channel::<Vec<f32>>(64);
                let (finalize_tx, finalize_rx) = tokio::sync::oneshot::channel::<()>();
                let cancel = tokio_util::sync::CancellationToken::new();
                let final_text = state.streaming_final_text.clone();
                let done = state.streaming_done.clone();

                if let Ok(mut g) = state.streaming_audio_tx.lock() {
                    *g = Some(audio_tx);
                }
                if let Ok(mut g) = state.streaming_finalize_tx.lock() {
                    *g = Some(finalize_tx);
                }
                if let Ok(mut g) = state.streaming_cancel.lock() {
                    *g = Some(cancel.clone());
                }

                tauri::async_runtime::spawn(async move {
                    deepgram_stream_session(
                        api_key,
                        sample_rate,
                        channels,
                        audio_rx,
                        finalize_rx,
                        cancel,
                        final_text,
                        done,
                    )
                    .await;
                });
            }
            Err(err) => {
                eprintln!(
                    "[mushu:deepgram] provider=deepgram pero sin key ({err}); fallback a Groq HTTP."
                );
                let _ = app.emit(
                    "transcription_error",
                    "Deepgram seleccionado pero sin API key. Usaré Groq HTTP.",
                );
            }
        }
    }

    emit_dictation_processing(app, false);
    emit_mushu_sound_prefs(app, state);
    // Mostrar el overlay antes de `recording_started`: el WebView suele bloquear audio si la ventana sigue oculta.
    let _ = show_overlay(app);
    let mode_info = ModeInfo::from(mode);
    let _ = app.emit("recording_started", mode_info.clone());
    {
        let app_for_overlay = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(90)).await;
            let Some(state) = app_for_overlay.try_state::<AppState>() else {
                return;
            };
            if !state.is_recording.load(Ordering::Acquire) {
                return;
            }
            if let Some(overlay) =
                app_for_overlay.get_webview_window(crate::overlay::OVERLAY_LABEL)
            {
                let _ = overlay.emit("recording_started", mode_info);
            }
        });
    }

    register_escape_shortcut(app);

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

pub(crate) fn do_stop_recording(state: &AppState, app: &tauri::AppHandle) -> Result<usize, String> {
    state.is_recording.store(false, Ordering::Release);
    let audio_len = state
        .audio_buffer
        .lock()
        .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?
        .len();

    // Si hay sesión Deepgram activa, dispara Finalize. Si NO se canceló por ESC,
    // emitimos `recording_stopped` para que el overlay haga el chime de stop normal.
    if !state.cancel_requested.load(Ordering::Acquire) {
        if let Ok(mut g) = state.streaming_finalize_tx.lock() {
            if let Some(tx) = g.take() {
                let _ = tx.send(());
            }
        }
        let _ = app.emit("recording_stopped", audio_len);
    }

    unregister_escape_shortcut(app);
    Ok(audio_len)
}

pub(crate) fn process_hotkey_release(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let t_pipeline = Instant::now();
        let state = app_handle.state::<AppState>();

        // Si ESC pidió cancelar antes/durante la liberación de la hotkey, salimos sin tocar nada más.
        if state.cancel_requested.swap(false, Ordering::AcqRel) {
            return;
        }

        let duration_ms = state
            .recording_started_at
            .lock()
            .ok()
            .and_then(|mut v| v.take())
            .map(|start| start.elapsed().as_millis() as i64)
            .unwrap_or(0);

        let settings = match state.settings.lock() {
            Ok(s) => s.clone(),
            Err(_) => {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit("transcription_error", "No se pudo leer settings");
                let _ = hide_overlay(&app_handle);
                return;
            }
        };

        // Explicar: sin captura ni STT; copia la selección del foco anterior y abre ventana dedicada.
        if settings.mode == Mode::Explain {
            let t_explain = Instant::now();
            if settings.processing_mode == ProcessingMode::LocalOnly {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit(
                    "transcription_error",
                    "Este modo requiere nube (Groq). Cambia 'Modo de procesamiento' a 'Nube primero'.",
                );
                let _ = hide_overlay(&app_handle);
                return;
            }
            let _ = hide_overlay(&app_handle);
            if let Err(e) = simulate_copy_selection() {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit("transcription_error", e);
                return;
            }
            tokio::time::sleep(Duration::from_millis(60)).await;
            let selection = match read_clipboard_text() {
                Ok(c) => truncate_for_groq(c.trim()),
                Err(e) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit(
                        "transcription_error",
                        format!("No se leyó el portapapeles: {e}"),
                    );
                    return;
                }
            };
            if selection.trim().is_empty() {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit(
                    "transcription_error",
                    "No hay texto seleccionado. Selecciona texto en la ventana activa y vuelve a soltar el atajo.",
                );
                return;
            }
            if let Err(e) = show_explain_window(&app_handle) {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit("transcription_error", e);
                return;
            }
            // Dar tiempo a que la webview cargue el bundle y registre los `listen` antes de emitir SSE.
            tokio::time::sleep(Duration::from_millis(280)).await;
            emit_explain_event(
                &app_handle,
                "explain_reset",
                serde_json::json!({ "loading": true }),
            );
            emit_dictation_processing(&app_handle, false);

            let app_spawn = app_handle.clone();
            let model = settings.model.clone();
            let sel = selection.clone();
            let duration_for_db = duration_ms;
            tauri::async_runtime::spawn(async move {
                let state = app_spawn.state::<AppState>();
                let t_llm = Instant::now();
                let mut full_reply = String::new();
                let stream_res =
                    groq_explain_stream(&state, &model, &sel, &app_spawn, &mut full_reply).await;
                let llm_ms = t_llm.elapsed().as_millis() as u64;
                let total_ms = t_explain.elapsed().as_millis() as u64;
                match stream_res {
                    Ok(()) => {
                        emit_explain_event(&app_spawn, "explain_done", serde_json::json!({}));
                        let t_db = Instant::now();
                        let _ = save_history(
                            &state.db,
                            &sel,
                            &full_reply,
                            Mode::Explain.as_str(),
                            duration_for_db,
                        )
                        .await;
                        let _db_ms = t_db.elapsed().as_millis() as u64;
                        emit_dictation_latency(&app_spawn, 0, llm_ms, 0, total_ms, "explain");
                    }
                    Err(err) => {
                        emit_explain_event(&app_spawn, "explain_error", err);
                    }
                }
            });
            return;
        }

        // Si hay sesión Deepgram activa, esperamos hasta 1.5s a que termine de procesar
        // los últimos `is_final` tras Finalize+CloseStream. Si entrega texto, lo usamos.
        let streaming_text = if settings.transcription_provider == TranscriptionProvider::Deepgram {
            let _ =
                tokio::time::timeout(Duration::from_millis(1500), state.streaming_done.notified())
                    .await;
            // Limpiar handles del state pase lo que pase.
            if let Ok(mut g) = state.streaming_audio_tx.lock() {
                *g = None;
            }
            if let Ok(mut g) = state.streaming_cancel.lock() {
                *g = None;
            }
            if let Ok(mut g) = state.streaming_finalize_tx.lock() {
                *g = None;
            }
            // Tomamos el texto consumiéndolo: si por algún motivo este pipeline corre dos veces
            // (handler de hotkey duplicado, race con ESC, etc.) la segunda lectura ve vacío.
            state
                .streaming_final_text
                .lock()
                .ok()
                .map(|mut s| std::mem::take(&mut *s).trim().to_string())
                .filter(|s| !s.is_empty())
        } else {
            None
        };

        let t_capture = Instant::now();
        let captured = match capture_audio(&state) {
            Ok(text) => text,
            Err(e) => {
                emit_dictation_processing(&app_handle, false);
                let _ = app_handle.emit("transcription_error", e);
                let _ = hide_overlay(&app_handle);
                return;
            }
        };
        let capture_ms = t_capture.elapsed().as_millis() as u64;

        let (raw_text, mut transcription_metrics) = if let Some(text) = streaming_text {
            let metrics = TranscriptionMetrics {
                backend: "deepgram_nova3_ws",
                audio_duration_ms: captured.duration_ms(),
                ..TranscriptionMetrics::default()
            };
            (text, metrics)
        } else {
            match transcribe_audio(&state, &settings, &captured).await {
                Ok(output) => output,
                Err(e) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit("transcription_error", e);
                    let _ = hide_overlay(&app_handle);
                    return;
                }
            }
        };
        transcription_metrics.capture_ms = capture_ms;
        transcription_metrics.recording_duration_ms = duration_ms.max(0) as u64;
        let whisper_ms = transcription_metrics.groq_stt_upload_and_transcribe_ms
            + transcription_metrics.local_whisper_ms
            + transcription_metrics.encode_audio_ms;
        let raw_text = match meaningful_speech_from_whisper(&raw_text) {
            Some(t) => t,
            None => {
                log_pipeline_timing(
                    "sin_habla",
                    &transcription_metrics,
                    0,
                    0,
                    0,
                    t_pipeline.elapsed().as_millis() as u64,
                );
                emit_dictation_processing(&app_handle, false);
                let _ = hide_overlay(&app_handle);
                return;
            }
        };

        if settings.processing_mode == ProcessingMode::LocalOnly
            && (settings.mode == Mode::Help
                || settings.mode == Mode::ReplyEn
                || settings.mode == Mode::Explain)
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
            let t_llm = Instant::now();
            match mushu_assistant_reply(&state, &raw_text).await {
                Ok(reply) => {
                    let llm_ms = t_llm.elapsed().as_millis() as u64;
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit("mushu_reply", serde_json::json!({ "text": reply }));
                    let t_db = Instant::now();
                    let _ = save_history(
                        &state.db,
                        &raw_text,
                        &reply,
                        settings.mode.as_str(),
                        duration_ms,
                    )
                    .await;
                    let db_save_ms = t_db.elapsed().as_millis() as u64;
                    let total_ms = t_pipeline.elapsed().as_millis() as u64;
                    log_pipeline_timing(
                        "help",
                        &transcription_metrics,
                        llm_ms,
                        0,
                        db_save_ms,
                        total_ms,
                    );
                    emit_dictation_latency(&app_handle, whisper_ms, llm_ms, 0, total_ms, "help");
                    tokio::time::sleep(Duration::from_millis(2500)).await;
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
            let t_llm = Instant::now();
            match groq_english_reply_from_clipboard(&state, &settings.model, &clip, &raw_text).await
            {
                Ok(processed_text) => {
                    let llm_ms = t_llm.elapsed().as_millis() as u64;
                    let t_paste = Instant::now();
                    if let Err(e) = paste_text(&processed_text) {
                        emit_dictation_processing(&app_handle, false);
                        let _ = app_handle.emit("transcription_error", e);
                        let _ = hide_overlay(&app_handle);
                        return;
                    }
                    let paste_ms = t_paste.elapsed().as_millis() as u64;
                    let raw_for_db = format!(
                        "(contexto EN, {} chars)\n{}\n\n(voz)\n{}",
                        clip.chars().count(),
                        clip.chars().take(2500).collect::<String>(),
                        raw_text
                    );
                    let t_db = Instant::now();
                    let _ = save_history(
                        &state.db,
                        &raw_for_db,
                        &processed_text,
                        settings.mode.as_str(),
                        duration_ms,
                    )
                    .await;
                    let db_save_ms = t_db.elapsed().as_millis() as u64;
                    emit_dictation_processing(&app_handle, false);
                    let payload = serde_json::json!({
                        "text": processed_text,
                        "mode": ModeInfo::from(settings.mode),
                    });
                    let _ = app_handle.emit("transcription_done", payload);
                    let total_ms = t_pipeline.elapsed().as_millis() as u64;
                    log_pipeline_timing(
                        "reply_en",
                        &transcription_metrics,
                        llm_ms,
                        paste_ms,
                        db_save_ms,
                        total_ms,
                    );
                    emit_dictation_latency(
                        &app_handle,
                        whisper_ms,
                        llm_ms,
                        paste_ms,
                        total_ms,
                        "reply_en",
                    );
                    tokio::time::sleep(Duration::from_millis(900)).await;
                }
                Err(err) => {
                    let _ = app_handle.emit("groq_error", &err);
                    emit_dictation_processing(&app_handle, false);
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
            let t_llm = Instant::now();
            match mushu_assistant_reply(&state, &question).await {
                Ok(reply) => {
                    let llm_ms = t_llm.elapsed().as_millis() as u64;
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit("mushu_reply", serde_json::json!({ "text": reply }));
                    let total_ms = t_pipeline.elapsed().as_millis() as u64;
                    log_pipeline_timing(
                        "pregunta_mushu",
                        &transcription_metrics,
                        llm_ms,
                        0,
                        0,
                        total_ms,
                    );
                    emit_dictation_latency(
                        &app_handle,
                        whisper_ms,
                        llm_ms,
                        0,
                        total_ms,
                        "pregunta_mushu",
                    );
                    tokio::time::sleep(Duration::from_millis(2500)).await;
                }
                Err(err) => {
                    emit_dictation_processing(&app_handle, false);
                    let _ = app_handle.emit("groq_error", err);
                }
            }
            let _ = hide_overlay(&app_handle);
            return;
        }

        let t_llm = Instant::now();
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
        let llm_ms = t_llm.elapsed().as_millis() as u64;

        if meaningful_speech_from_whisper(&processed_text).is_none() {
            emit_dictation_processing(&app_handle, false);
            let _ = hide_overlay(&app_handle);
            return;
        }

        let t_paste = Instant::now();
        if let Err(e) = paste_text(&processed_text) {
            emit_dictation_processing(&app_handle, false);
            let _ = app_handle.emit("transcription_error", e);
            let _ = hide_overlay(&app_handle);
            return;
        }
        let paste_ms = t_paste.elapsed().as_millis() as u64;

        let t_db = Instant::now();
        let _ = save_history(
            &state.db,
            &raw_text,
            &processed_text,
            settings.mode.as_str(),
            duration_ms,
        )
        .await;
        let db_save_ms = t_db.elapsed().as_millis() as u64;

        emit_dictation_processing(&app_handle, false);
        let payload = serde_json::json!({
            "text": processed_text,
            "mode": ModeInfo::from(settings.mode),
        });
        let _ = app_handle.emit("transcription_done", payload);
        let total_ms = t_pipeline.elapsed().as_millis() as u64;
        log_pipeline_timing(
            "dictado",
            &transcription_metrics,
            llm_ms,
            paste_ms,
            db_save_ms,
            total_ms,
        );
        emit_dictation_latency(
            &app_handle,
            whisper_ms,
            llm_ms,
            paste_ms,
            total_ms,
            "dictado",
        );
        tokio::time::sleep(Duration::from_millis(900)).await;
        let _ = hide_overlay(&app_handle);
    });
}
