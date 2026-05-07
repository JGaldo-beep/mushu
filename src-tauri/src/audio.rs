use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};

use crate::{AppState, AudioDevice, CapturedAudio, WHISPER_SAMPLE_RATE};

pub(crate) fn list_input_devices() -> Result<Vec<String>, String> {
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

/// No debe tumbar `get_frontend_state` (p. ej. onboarding) si el stack de audio falla al enumerar.
pub(crate) fn list_input_devices_or_empty() -> Vec<String> {
    list_input_devices().unwrap_or_else(|e| {
        eprintln!("[mushu] list_input_devices failed (lista vacía): {e}");
        Vec::new()
    })
}

pub(crate) fn initialize_audio_device(preferred_name: Option<&str>) -> Result<AudioDevice, String> {
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

pub(crate) fn capture_audio(state: &AppState) -> Result<CapturedAudio, String> {
    let audio = {
        let mut buf = state
            .audio_buffer
            .lock()
            .map_err(|_| "No se pudo bloquear audio_buffer".to_string())?;
        std::mem::take(&mut *buf)
    };
    let (sample_rate, channels) = {
        let device = state
            .audio_device
            .lock()
            .map_err(|_| "No se pudo bloquear audio_device".to_string())?;
        (device.sample_rate, device.channels)
    };
    Ok(CapturedAudio {
        samples: audio,
        sample_rate,
        channels,
    })
}

pub(crate) fn record_audio(app: tauri::AppHandle) -> Result<(), String> {
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

/// Empuja samples al canal de streaming si hay una sesión Deepgram activa.
/// Best-effort: si el canal está lleno se descarta el chunk; el `audio_buffer` que
/// también se llena en paralelo cubre la pérdida vía fallback Groq HTTP.
fn forward_to_streaming(state: &AppState, samples: Vec<f32>) {
    let Ok(guard) = state.streaming_audio_tx.lock() else {
        return;
    };
    let Some(tx) = guard.as_ref() else {
        return;
    };
    let _ = tx.try_send(samples);
}

fn append_f32_samples(app: &tauri::AppHandle, data: &[f32]) {
    let state = app.state::<AppState>();
    if !state.is_recording.load(Ordering::Acquire) {
        return;
    }
    // En pausa: cpal sigue activo (mantiene el stream abierto) pero descartamos audio.
    // El KeepAlive del WS se sigue mandando cada 3s, así Deepgram no cierra por timeout.
    if state.is_paused.load(Ordering::Acquire) {
        return;
    }
    if let Ok(mut audio_buffer) = state.audio_buffer.lock() {
        audio_buffer.extend_from_slice(data);
    }
    forward_to_streaming(&state, data.to_vec());
    emit_audio_level(app, data.iter().copied());
}

fn append_i16_samples(app: &tauri::AppHandle, data: &[i16]) {
    let state = app.state::<AppState>();
    if !state.is_recording.load(Ordering::Acquire) {
        return;
    }
    if state.is_paused.load(Ordering::Acquire) {
        return;
    }
    let f32_samples: Vec<f32> = data
        .iter()
        .map(|sample| *sample as f32 / i16::MAX as f32)
        .collect();
    if let Ok(mut audio_buffer) = state.audio_buffer.lock() {
        audio_buffer.extend_from_slice(&f32_samples);
    }
    let levels = f32_samples.clone();
    forward_to_streaming(&state, f32_samples);
    emit_audio_level(app, levels.into_iter());
}

fn append_u16_samples(app: &tauri::AppHandle, data: &[u16]) {
    let state = app.state::<AppState>();
    if !state.is_recording.load(Ordering::Acquire) {
        return;
    }
    if state.is_paused.load(Ordering::Acquire) {
        return;
    }
    let f32_samples: Vec<f32> = data
        .iter()
        .map(|sample| (*sample as f32 - 32768.0) / 32768.0)
        .collect();
    if let Ok(mut audio_buffer) = state.audio_buffer.lock() {
        audio_buffer.extend_from_slice(&f32_samples);
    }
    let levels = f32_samples.clone();
    forward_to_streaming(&state, f32_samples);
    emit_audio_level(app, levels.into_iter());
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

pub(crate) fn prepare_audio_for_whisper(
    input: &[f32],
    sample_rate: u32,
    channels: u16,
) -> Vec<f32> {
    let mono = mix_to_mono(input, channels);
    if sample_rate == WHISPER_SAMPLE_RATE {
        return mono;
    }
    resample_linear(&mono, sample_rate, WHISPER_SAMPLE_RATE)
}

pub(crate) fn mix_to_mono(input: &[f32], channels: u16) -> Vec<f32> {
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
