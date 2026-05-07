use serde::Deserialize;
use std::error::Error;
use std::fs::{self, File};
use std::io::copy;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::audio::{mix_to_mono, prepare_audio_for_whisper};
use crate::secrets::load_groq_api_key;
use crate::settings::{AppSettings, ProcessingMode};
use crate::{
    AppState, CapturedAudio, TranscriptionMetrics, WhisperState, DEEPGRAM_MODEL, DEEPGRAM_WS_URL,
    GROQ_STT_ENDPOINT, GROQ_STT_MODEL, WHISPER_MODEL_FILE, WHISPER_MODEL_URL,
};

#[derive(Deserialize)]
struct GroqTranscriptionResponse {
    text: String,
}

pub(crate) async fn transcribe_audio(
    state: &AppState,
    settings: &AppSettings,
    audio: &CapturedAudio,
) -> Result<(String, TranscriptionMetrics), String> {
    let mut metrics = TranscriptionMetrics {
        audio_duration_ms: audio.duration_ms(),
        ..TranscriptionMetrics::default()
    };
    if audio.samples.is_empty() {
        metrics.backend = "empty";
        return Ok((String::new(), metrics));
    }

    if settings.processing_mode == ProcessingMode::CloudFirst {
        let t_encode = Instant::now();
        let wav = encode_wav_pcm16(audio);
        metrics.encode_audio_ms = t_encode.elapsed().as_millis() as u64;
        metrics.audio_bytes = wav.len();

        let t_groq = Instant::now();
        match transcribe_audio_groq(state, wav).await {
            Ok(text) => {
                metrics.backend = "groq_whisper_large_v3_turbo";
                metrics.groq_stt_upload_and_transcribe_ms = t_groq.elapsed().as_millis() as u64;
                return Ok((text, metrics));
            }
            Err(err) => {
                metrics.groq_stt_upload_and_transcribe_ms = t_groq.elapsed().as_millis() as u64;
                eprintln!("[mushu:latency] groq_stt_error=\"{err}\" fallback=local_whisper");
            }
        }
    }

    let t_local = Instant::now();
    let text = transcribe_audio_local(state, audio)?;
    metrics.backend = "local_whisper";
    metrics.local_whisper_ms = t_local.elapsed().as_millis() as u64;
    Ok((text, metrics))
}

async fn transcribe_audio_groq(state: &AppState, wav: Vec<u8>) -> Result<String, String> {
    let key = load_groq_api_key(state)?;
    let file_part = reqwest::multipart::Part::bytes(wav)
        .file_name("dictation.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", GROQ_STT_MODEL)
        .text("language", "es")
        .text("temperature", "0")
        .text("response_format", "json");
    let response = tokio::time::timeout(
        Duration::from_secs(10),
        state
            .llm_client
            .post(GROQ_STT_ENDPOINT)
            .bearer_auth(key)
            .multipart(form)
            .send(),
    )
    .await
    .map_err(|_| "Timeout de Groq STT".to_string())?
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;
    let parsed: GroqTranscriptionResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.text.trim().to_string())
}

fn transcribe_audio_local(state: &AppState, audio: &CapturedAudio) -> Result<String, String> {
    let whisper_audio =
        prepare_audio_for_whisper(&audio.samples, audio.sample_rate, audio.channels);
    let slot = state
        .whisper
        .lock()
        .map_err(|_| "No se pudo bloquear Whisper".to_string())?;
    let inner = slot.as_ref().ok_or_else(|| {
        "Whisper aún se está descargando o cargando. Espera unos segundos y vuelve a intentar."
            .to_string()
    })?;
    let context = inner
        .context
        .lock()
        .map_err(|_| "No se pudo bloquear WhisperContext".to_string())?;
    let mut w_state = context
        .create_state()
        .map_err(|error| format!("No se pudo crear WhisperState: {error}"))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    let n_threads = std::thread::available_parallelism()
        .map(|n| (n.get() as i32).clamp(1, 16))
        .unwrap_or(4);
    params.set_n_threads(n_threads);
    params.set_single_segment(true);
    params.set_no_context(true);
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

pub(crate) fn encode_wav_pcm16(audio: &CapturedAudio) -> Vec<u8> {
    let mono = mix_to_mono(&audio.samples, audio.channels);
    let sample_rate = audio.sample_rate.max(1);
    let bits_per_sample = 16u16;
    let channels = 1u16;
    let byte_rate = sample_rate * u32::from(channels) * u32::from(bits_per_sample) / 8;
    let block_align = channels * bits_per_sample / 8;
    let data_size = (mono.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_size as usize);

    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_size).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&bits_per_sample.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());

    for sample in mono {
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        out.extend_from_slice(&pcm.to_le_bytes());
    }
    out
}

/// Convierte un chunk de samples f32 (interleaved) a bytes PCM16 LE mono listos para WS.
fn f32_chunk_to_pcm16_mono_bytes(samples: &[f32], channels: u16) -> Vec<u8> {
    let ch = usize::from(channels.max(1));
    if ch == 1 {
        let mut out = Vec::with_capacity(samples.len() * 2);
        for s in samples {
            let pcm = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            out.extend_from_slice(&pcm.to_le_bytes());
        }
        out
    } else {
        let frames = samples.len() / ch;
        let mut out = Vec::with_capacity(frames * 2);
        for frame in samples.chunks_exact(ch) {
            let avg = frame.iter().sum::<f32>() / ch as f32;
            let pcm = (avg.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            out.extend_from_slice(&pcm.to_le_bytes());
        }
        out
    }
}

/// Sesión WS contra Deepgram para streaming de audio. Conecta, escribe samples
/// según llegan del callback de cpal, y al recibir `finalize_rx` manda Finalize+CloseStream
/// para forzar el transcript final. Cancelación vía `cancel` corta sin Finalize (ESC).
pub(crate) async fn deepgram_stream_session(
    api_key: String,
    sample_rate: u32,
    channels_in: u16,
    mut audio_rx: tokio::sync::mpsc::Receiver<Vec<f32>>,
    finalize_rx: tokio::sync::oneshot::Receiver<()>,
    cancel: tokio_util::sync::CancellationToken,
    final_text: Arc<Mutex<String>>,
    done: Arc<tokio::sync::Notify>,
) {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};

    // Notificar al final pase lo que pase para que process_hotkey_release no se quede bloqueado.
    let _guard = scopeguard_notify(done.clone());

    let url = format!(
        "{}?encoding=linear16&sample_rate={}&channels=1&language=es&model={}&smart_format=true&punctuate=true&endpointing=300",
        DEEPGRAM_WS_URL, sample_rate, DEEPGRAM_MODEL
    );
    let mut request = match url.into_client_request() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[mushu:deepgram] no se pudo construir el request: {e}");
            return;
        }
    };
    let auth_value = match format!("Token {api_key}").parse() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[mushu:deepgram] header Authorization inválido: {e}");
            return;
        }
    };
    request.headers_mut().insert("Authorization", auth_value);

    let connect_t = Instant::now();
    let ws_stream = match tokio::time::timeout(
        Duration::from_secs(5),
        tokio_tungstenite::connect_async(request),
    )
    .await
    {
        Ok(Ok((stream, _resp))) => {
            eprintln!(
                "[mushu:deepgram] conectado en {}ms",
                connect_t.elapsed().as_millis()
            );
            stream
        }
        Ok(Err(e)) => {
            eprintln!("[mushu:deepgram] fallo de conexión: {e}");
            return;
        }
        Err(_) => {
            eprintln!("[mushu:deepgram] timeout conectando");
            return;
        }
    };

    let (mut sink, mut stream) = ws_stream.split();
    tokio::pin!(finalize_rx);

    let mut keepalive = tokio::time::interval(Duration::from_secs(3));
    keepalive.tick().await; // descartar el tick inmediato

    let mut writer_done = false;
    let mut reader_open = true;

    while !(writer_done && !reader_open) {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                // Drop directo: no Finalize, no CloseStream. La conexión cierra.
                eprintln!("[mushu:deepgram] cancelado");
                return;
            }
            res = &mut finalize_rx, if !writer_done => {
                let _ = res;
                let _ = sink
                    .send(Message::Text("{\"type\":\"Finalize\"}".to_string()))
                    .await;
                // Drenar cualquier sample residual antes de cerrar.
                while let Ok(samples) = audio_rx.try_recv() {
                    let bytes = f32_chunk_to_pcm16_mono_bytes(&samples, channels_in);
                    if bytes.is_empty() { continue; }
                    if sink.send(Message::Binary(bytes)).await.is_err() {
                        break;
                    }
                }
                let _ = sink
                    .send(Message::Text("{\"type\":\"CloseStream\"}".to_string()))
                    .await;
                writer_done = true;
            }
            maybe_samples = audio_rx.recv(), if !writer_done => {
                match maybe_samples {
                    Some(samples) => {
                        let bytes = f32_chunk_to_pcm16_mono_bytes(&samples, channels_in);
                        if bytes.is_empty() { continue; }
                        if sink.send(Message::Binary(bytes)).await.is_err() {
                            writer_done = true;
                        }
                    }
                    None => {
                        // El sender se dropeó (ESC, fin de grabación sin Finalize).
                        writer_done = true;
                    }
                }
            }
            _ = keepalive.tick(), if !writer_done => {
                if sink
                    .send(Message::Text("{\"type\":\"KeepAlive\"}".to_string()))
                    .await
                    .is_err()
                {
                    writer_done = true;
                }
            }
            msg = stream.next(), if reader_open => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                            let is_final = value
                                .get("is_final")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            if is_final {
                                let transcript = value
                                    .get("channel")
                                    .and_then(|c| c.get("alternatives"))
                                    .and_then(|a| a.as_array())
                                    .and_then(|a| a.first())
                                    .and_then(|alt| alt.get("transcript"))
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .trim();
                                if !transcript.is_empty() {
                                    if let Ok(mut buf) = final_text.lock() {
                                        if !buf.is_empty() {
                                            buf.push(' ');
                                        }
                                        buf.push_str(transcript);
                                    }
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        reader_open = false;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        eprintln!("[mushu:deepgram] error de lectura: {e}");
                        reader_open = false;
                    }
                    None => {
                        reader_open = false;
                    }
                }
            }
            else => {
                break;
            }
        }
    }
}

/// Garantiza que `done.notify_waiters()` se llame al salir del scope (Ok o Err o panic).
struct ScopeGuardNotify(Arc<tokio::sync::Notify>);
impl Drop for ScopeGuardNotify {
    fn drop(&mut self) {
        self.0.notify_waiters();
    }
}
fn scopeguard_notify(notify: Arc<tokio::sync::Notify>) -> ScopeGuardNotify {
    ScopeGuardNotify(notify)
}

pub(crate) fn initialize_whisper(app: &tauri::AppHandle) -> Result<WhisperState, Box<dyn Error>> {
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
