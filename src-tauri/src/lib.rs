use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::error::Error;
use std::fs::{self, File};
use std::io::copy;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::{thread, time::Duration};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const WHISPER_MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const WHISPER_MODEL_FILE: &str = "ggml-base.bin";
const WHISPER_SAMPLE_RATE: u32 = 16_000;

struct AppState {
    is_recording: AtomicBool,
    audio_buffer: Mutex<Vec<f32>>,
    audio_device: AudioDevice,
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

#[tauri::command]
fn start_recording(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    do_start_recording(&state, &app)
}

#[tauri::command]
fn stop_recording(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<usize, String> {
    do_stop_recording(&state, &app)
}

#[tauri::command]
fn transcribe(
    app_state: tauri::State<AppState>,
    whisper_state: tauri::State<WhisperState>,
) -> Result<String, String> {
    transcribe_audio(&app_state, &whisper_state)
}

#[tauri::command]
fn stop_and_transcribe(
    app_state: tauri::State<AppState>,
    whisper_state: tauri::State<WhisperState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    do_stop_recording(&app_state, &app)?;
    let text = transcribe_audio(&app_state, &whisper_state)?;
    if !text.is_empty() {
        paste_text(&text)?;
    }
    app.emit("transcription_done", &text)
        .map_err(|e| e.to_string())?;
    Ok(text)
}

fn do_start_recording(state: &AppState, app: &tauri::AppHandle) -> Result<(), String> {
    if state.is_recording.swap(true, Ordering::AcqRel) {
        return Ok(());
    }

    state
        .audio_buffer
        .lock()
        .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?
        .clear();

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

    let _ = app.emit("recording_started", ());
    let _ = show_overlay(app);

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
    let _ = hide_overlay(app);

    Ok(audio_len)
}

fn transcribe_audio(app_state: &AppState, whisper_state: &WhisperState) -> Result<String, String> {
    let audio = {
        let mut buf = app_state
            .audio_buffer
            .lock()
            .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?;
        std::mem::take(&mut *buf)
    };

    if audio.is_empty() {
        return Ok(String::new());
    }

    let sample_rate = app_state.audio_device.sample_rate;
    let channels = app_state.audio_device.channels;

    let whisper_audio = prepare_audio_for_whisper(&audio, sample_rate, channels);

    let context = whisper_state
        .context
        .lock()
        .map_err(|_| "No se pudo bloquear WhisperContext".to_string())?;
    let mut state = context
        .create_state()
        .map_err(|error| format!("No se pudo crear WhisperState: {error}"))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("es"));
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    state
        .full(params, &whisper_audio)
        .map_err(|error| format!("Whisper fallo al transcribir: {error}"))?;

    let mut text = String::new();
    for segment in state.as_iter() {
        text.push_str(&segment.to_string());
    }

    Ok(text.trim().to_string())
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

fn record_audio(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let audio_device = &state.audio_device;

    let app_for_error = app.clone();
    let error_callback = move |error: cpal::StreamError| {
        eprintln!("audio stream error: {error}");
        let _ = app_for_error.emit("recording_error", error.to_string());
    };

    let stream = match audio_device.sample_format {
        cpal::SampleFormat::F32 => {
            let app_for_data = app.clone();
            audio_device.device.build_input_stream(
                &audio_device.config,
                move |data: &[f32], _| append_f32_samples(&app_for_data, data),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let app_for_data = app.clone();
            audio_device.device.build_input_stream(
                &audio_device.config,
                move |data: &[i16], _| append_i16_samples(&app_for_data, data),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let app_for_data = app.clone();
            audio_device.device.build_input_stream(
                &audio_device.config,
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

fn initialize_audio_device() -> Result<AudioDevice, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No se encontro un microfono de entrada".to_string())?;
    let supported_config = device
        .default_input_config()
        .map_err(|error| format!("No se pudo leer la configuracion del microfono: {error}"))?;
    let sample_format = supported_config.sample_format();
    let stream_config: cpal::StreamConfig = supported_config.into();
    let sample_rate = stream_config.sample_rate.0;
    let channels = stream_config.channels;

    Ok(AudioDevice {
        device,
        config: stream_config,
        sample_format,
        sample_rate,
        channels,
    })
}

fn initialize_whisper(app: &tauri::App) -> Result<WhisperState, Box<dyn Error>> {
    let model_path = ensure_whisper_model(app)?;
    let context =
        WhisperContext::new_with_params(&model_path, WhisperContextParameters::default())?;

    Ok(WhisperState {
        context: Arc::new(Mutex::new(context)),
    })
}

fn ensure_whisper_model(app: &tauri::App) -> Result<PathBuf, Box<dyn Error>> {
    let model_path = whisper_model_path(app)?;

    if model_path.exists() && model_path.metadata()?.len() > 0 {
        return Ok(model_path);
    }

    download_whisper_model(&model_path)?;
    Ok(model_path)
}

fn whisper_model_path(app: &tauri::App) -> Result<PathBuf, Box<dyn Error>> {
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
            let scale = monitor.scale_factor();
            let outer = window.outer_size().map_err(|e| e.to_string())?;

            let bottom_margin = (80.0 * scale) as i32;
            let x = monitor_pos.x + (monitor_size.width as i32 - outer.width as i32) / 2;
            let y = monitor_pos.y + monitor_size.height as i32
                - outer.height as i32
                - bottom_margin;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    let state = app.state::<AppState>();
                    match event.state() {
                        ShortcutState::Pressed => {
                            let _ = do_start_recording(&state, app);
                        }
                        ShortcutState::Released => {
                            let _ = do_stop_recording(&state, app);

                            let app_clone = app.clone();
                            thread::spawn(move || {
                                let app_state = app_clone.state::<AppState>();
                                let whisper_state = app_clone.state::<WhisperState>();

                                match transcribe_audio(&app_state, &whisper_state) {
                                    Ok(text) => {
                                        if !text.is_empty() {
                                            if let Err(e) = paste_text(&text) {
                                                let _ = app_clone.emit("transcription_error", e);
                                                return;
                                            }
                                        }
                                        let _ = app_clone.emit("transcription_done", &text);
                                    }
                                    Err(e) => {
                                        let _ = app_clone.emit("transcription_error", e);
                                    }
                                }
                            });
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let whisper_state = initialize_whisper(app)?;
            app.manage(whisper_state);

            let audio_device = initialize_audio_device()?;
            app.manage(AppState {
                is_recording: AtomicBool::new(false),
                audio_buffer: Mutex::new(Vec::new()),
                audio_device,
            });

            app.handle()
                .global_shortcut()
                .register(Shortcut::new(Some(Modifiers::CONTROL), Code::Space))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            transcribe,
            stop_and_transcribe
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
