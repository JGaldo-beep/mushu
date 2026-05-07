use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tauri::Manager;

use crate::modes::{mode_prompt, validate_model, Mode};
use crate::overlay::emit_explain_event;
use crate::secrets::load_groq_api_key;
use crate::{AppState, DEFAULT_MODEL, GROQ_CHAT_ENDPOINT};

#[derive(Serialize, Deserialize)]
pub(crate) struct GroqMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Serialize)]
pub(crate) struct GroqRequest {
    pub(crate) model: String,
    pub(crate) temperature: f32,
    pub(crate) messages: Vec<GroqMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) max_tokens: Option<u32>,
}

#[derive(Deserialize)]
pub(crate) struct GroqChoice {
    pub(crate) message: GroqMessage,
}

#[derive(Deserialize)]
pub(crate) struct GroqResponse {
    pub(crate) choices: Vec<GroqChoice>,
}

pub(crate) async fn transform_with_mode(
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
                content: "Eres un asistente experto en reescritura de texto en español."
                    .to_string(),
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
            .post(GROQ_CHAT_ENDPOINT)
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
pub(crate) async fn test_groq(state: tauri::State<'_, AppState>) -> Result<String, String> {
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
            .post(GROQ_CHAT_ENDPOINT)
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
    Ok(format!(
        "Groq respondió correctamente (modelo {model}). Vista previa: {reply}"
    ))
}

pub(crate) async fn mushu_assistant_reply(
    state: &AppState,
    user_question: &str,
) -> Result<String, String> {
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
Dictado local con Whisper; Groq puede reescribir según el modo. Modos: general, correo, formal, casual, código, ayuda (preguntas a ti), responder EN (clipboard en inglés + voz), explicar (texto seleccionado + resumen en overlay). El modo activo se cambia con el atajo global que el usuario configuró en Ajustes → Atajos de teclado (“Cambiar modo”); nunca por frases en el dictado.

REGLAS:
- Responde directo a la pregunta; nada de meta-instrucciones ("aquí tienes", "enumera", "devuelve la lista") sin contenido útil.
- No cites atajos concretos (Ctrl, Cmd, etc.) salvo que el usuario los haya escrito en su pregunta: pueden cambiarse en Ajustes. Para atajos, di que los vea en Ajustes → Atajos de teclado.
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
            .post(GROQ_CHAT_ENDPOINT)
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

pub(crate) async fn groq_english_reply_from_clipboard(
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
            .post(GROQ_CHAT_ENDPOINT)
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

pub(crate) async fn groq_explain_stream(
    state: &AppState,
    model: &str,
    user_text: &str,
    app: &tauri::AppHandle,
    full_out: &mut String,
) -> Result<(), String> {
    emit_explain_event(app, "explain_reset", serde_json::json!({ "loading": true }));
    validate_model(model)?;
    let key = load_groq_api_key(state)?;
    const SYSTEM: &str = r#"Eres un asistente experto. El usuario comparte un texto que seleccionó en su pantalla.
Explícalo de forma clara y concisa en el mismo idioma que el texto. Máximo unas 150 palabras.
Ve directo al punto, sin saludos ni meta-comentarios."#;
    let body = serde_json::json!({
        "model": model,
        "temperature": 0.35,
        "max_tokens": 400,
        "stream": true,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_text}
        ]
    });
    let response = tokio::time::timeout(
        Duration::from_secs(90),
        state
            .llm_client
            .post(GROQ_CHAT_ENDPOINT)
            .bearer_auth(key)
            .json(&body)
            .send(),
    )
    .await
    .map_err(|_| "Timeout de Groq (explicar)".to_string())?
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;

    let mut stream = response.bytes_stream();
    let mut line_buf = String::new();
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| e.to_string())?;
        line_buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = line_buf.find('\n') {
            let line = line_buf[..pos].trim_end_matches('\r').trim().to_string();
            line_buf.drain(..=pos);
            if line.is_empty() {
                continue;
            }
            if line == "data: [DONE]" {
                continue;
            }
            let Some(json_str) = line.strip_prefix("data: ") else {
                continue;
            };
            let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) else {
                continue;
            };
            let piece = v["choices"]
                .get(0)
                .and_then(|c| c["delta"]["content"].as_str())
                .unwrap_or("");
            if !piece.is_empty() {
                full_out.push_str(piece);
                emit_explain_event(
                    app,
                    "explain_chunk",
                    serde_json::json!({ "content": full_out }),
                );
            }
        }
    }
    let tail = line_buf.trim();
    if !tail.is_empty() {
        if let Some(json_str) = tail.strip_prefix("data: ") {
            if json_str != "[DONE]" {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                    let piece = v["choices"]
                        .get(0)
                        .and_then(|c| c["delta"]["content"].as_str())
                        .unwrap_or("");
                    if !piece.is_empty() {
                        full_out.push_str(piece);
                        emit_explain_event(
                            app,
                            "explain_chunk",
                            serde_json::json!({ "content": full_out }),
                        );
                    }
                }
            }
        }
    }
    if full_out.trim().is_empty() {
        return Err("Respuesta vacía (explicar)".to_string());
    }
    Ok(())
}

pub(crate) fn prewarm_groq(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        let key = match load_groq_api_key(&state) {
            Ok(key) => key,
            Err(err) => {
                eprintln!("[mushu:latency] groq_prewarm=skipped reason=\"{err}\"");
                return;
            }
        };
        let req = GroqRequest {
            model: DEFAULT_MODEL.to_string(),
            temperature: 0.0,
            messages: vec![GroqMessage {
                role: "user".to_string(),
                content: "OK".to_string(),
            }],
            max_tokens: Some(1),
        };
        let t = Instant::now();
        let result = tokio::time::timeout(
            Duration::from_secs(4),
            state
                .llm_client
                .post(GROQ_CHAT_ENDPOINT)
                .bearer_auth(key)
                .json(&req)
                .send(),
        )
        .await;
        match result {
            Ok(Ok(response)) if response.status().is_success() => {
                eprintln!(
                    "[mushu:latency] groq_prewarm=ok ms={}",
                    t.elapsed().as_millis()
                );
            }
            Ok(Ok(response)) => {
                eprintln!(
                    "[mushu:latency] groq_prewarm=failed status={} ms={}",
                    response.status(),
                    t.elapsed().as_millis()
                );
            }
            Ok(Err(err)) => {
                eprintln!(
                    "[mushu:latency] groq_prewarm=failed error=\"{}\" ms={}",
                    err,
                    t.elapsed().as_millis()
                );
            }
            Err(_) => {
                eprintln!(
                    "[mushu:latency] groq_prewarm=timeout ms={}",
                    t.elapsed().as_millis()
                );
            }
        }
    });
}
