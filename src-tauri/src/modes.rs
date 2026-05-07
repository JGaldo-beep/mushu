use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};
use unicode_normalization::UnicodeNormalization;

use crate::settings::save_settings_file;
use crate::{AppState, TrayState, ALLOWED_GROQ_MODELS};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum Mode {
    Default,
    Email,
    Formal,
    Casual,
    Code,
    /// Preguntas solo sobre la app Mushu (cualquier dictado → asistente, sin pegar).
    Help,
    /// Portapapeles = mensaje en inglés (p. ej. Reddit) + voz con instrucción → respuesta en inglés pegada.
    ReplyEn,
    /// Simula copiar selección (Ctrl+C), explica el texto en overlay dedicado con streaming Groq.
    #[serde(alias = "TRANSLATE")]
    Explain,
}

impl Mode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Default => "DEFAULT",
            Self::Email => "EMAIL",
            Self::Formal => "FORMAL",
            Self::Casual => "CASUAL",
            Self::Code => "CODE",
            Self::Help => "HELP",
            Self::ReplyEn => "REPLY_EN",
            Self::Explain => "EXPLAIN",
        }
    }

    pub(crate) fn from_name(value: &str) -> Option<Self> {
        Some(match value {
            "DEFAULT" => Self::Default,
            "EMAIL" => Self::Email,
            "FORMAL" => Self::Formal,
            "CASUAL" => Self::Casual,
            "CODE" => Self::Code,
            "HELP" => Self::Help,
            "REPLY_EN" => Self::ReplyEn,
            "EXPLAIN" => Self::Explain,
            "TRANSLATE" => Self::Explain,
            _ => return None,
        })
    }

    fn color(self) -> &'static str {
        match self {
            // Neutro legible en tema claro y oscuro (evita blanco sobre vidrio claro).
            Self::Default => "#059669",
            Self::Email => "#3B82F6",
            Self::Formal => "#8B5CF6",
            Self::Casual => "#10B981",
            Self::Code => "#F59E0B",
            Self::Help => "#F472B6",
            Self::ReplyEn => "#38BDF8",
            Self::Explain => "#0d9488",
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
            Self::Explain => "BookOpen",
        }
    }
}

#[derive(Clone, Serialize)]
pub(crate) struct ModeInfo {
    /// Identificador estable (DEFAULT, EMAIL, …).
    pub(crate) name: String,
    /// Etiqueta corta en español para la UI ("Modo correo", …).
    pub(crate) label: String,
    pub(crate) color: String,
    pub(crate) icon: String,
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
            Mode::Explain => "Modo explicar",
        };
        Self {
            name: value.as_str().to_string(),
            label: label.to_string(),
            color: value.color().to_string(),
            icon: value.icon().to_string(),
        }
    }
}

pub(crate) fn next_mode(mode: Mode) -> Mode {
    match mode {
        Mode::Default => Mode::Email,
        Mode::Email => Mode::Formal,
        Mode::Formal => Mode::Casual,
        Mode::Casual => Mode::Code,
        Mode::Code => Mode::Help,
        Mode::Help => Mode::ReplyEn,
        Mode::ReplyEn => Mode::Explain,
        Mode::Explain => Mode::Default,
    }
}

pub(crate) fn mode_prompt(mode: Mode) -> &'static str {
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
        Mode::Help | Mode::ReplyEn | Mode::Explain => {
            "Este modo se procesa en un flujo dedicado; no uses esta plantilla."
        }
    }
}

pub(crate) fn validate_model(model: &str) -> Result<(), String> {
    if ALLOWED_GROQ_MODELS.contains(&model) {
        return Ok(());
    }
    Err(format!(
        "Modelo no permitido: {model}. Modelos válidos: {}",
        ALLOWED_GROQ_MODELS.join(", ")
    ))
}

pub(crate) fn update_mode(
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

#[tauri::command]
pub(crate) fn set_mode(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    mode: String,
) -> Result<(), String> {
    if state.is_recording.load(Ordering::Acquire) {
        return Err("No se puede cambiar el modo mientras grabas.".to_string());
    }
    let parsed = Mode::from_name(&mode).ok_or_else(|| format!("Modo inválido: {mode}"))?;
    update_mode(&app, &state, parsed, true)
}

// === Helpers de texto post-transcripción (limpieza Whisper + detección de comandos) ===

pub(crate) fn strip_whisper_brackets(text: &str) -> String {
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

/// None cuando no hay habla útil: vacío, solo puntuación, o alucinaciones típicas de Whisper.
pub(crate) fn meaningful_speech_from_whisper(raw: &str) -> Option<String> {
    let cleaned = strip_whisper_brackets(raw).trim().to_string();
    if cleaned.is_empty() {
        return None;
    }
    if !cleaned.chars().any(|c| c.is_alphabetic()) {
        return None;
    }
    let norm = normalize_text(&cleaned);
    let collapsed: String = norm.split_whitespace().collect::<Vec<_>>().join(" ");
    const HALLUC: &[&str] = &[
        "music",
        "musica",
        "applause",
        "aplauso",
        "silence",
        "silencio",
        "no speech",
        "sin habla",
        "blank audio",
        "noise",
        "ruido",
        "static",
        "statics",
        "inaudible",
        "unintelligible",
        "indistinct",
        "subtitle",
        "subtitles",
        "subtitulos",
        "thank you",
        "thanks for watching",
        "gracias por ver",
        "subscribe",
        "suscribete",
    ];
    if collapsed.len() <= 56 {
        for h in HALLUC {
            if collapsed == *h {
                return None;
            }
        }
    }
    let words: Vec<&str> = collapsed.split_whitespace().collect();
    if words.len() <= 3 {
        for w in &words {
            if HALLUC.iter().any(|&h| h == *w) {
                return None;
            }
        }
    }
    Some(cleaned)
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
pub(crate) fn detect_pregunta_mushu(text: &str) -> Option<String> {
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
                "¿Qué modos tiene Mushu y dónde en la app se ve o cambia el modo activo? Responde en pocas frases."
                    .to_string()
            } else {
                rest.to_string()
            };
            return Some(q);
        }
    }
    None
}
