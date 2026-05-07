use keyring::Entry;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::time::Duration;
use tauri::Manager;

use crate::AppState;

pub(crate) const KEYRING_SERVICE: &str = "com.mushu.desktop";
pub(crate) const KEYRING_USER: &str = "groq_api_key";
pub(crate) const KEYRING_USER_DEEPGRAM: &str = "deepgram_api_key";
const DEFAULT_REDEEM_URL: &str = "https://www.juangaldo.com/api/redeem";

#[derive(Deserialize)]
struct RedeemGroqResponse {
    groq_api_key: String,
}

/// Lee `secrets.json` y devuelve el JSON ya parseado, o un objeto vacío.
fn read_secrets_json(path: &Path) -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

/// Escribe `secrets.json` actualizando solo la clave indicada (preserva otras keys de proveedores).
fn write_secret_field(app: &tauri::AppHandle, field: &str, value: &str) -> Result<(), String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("secrets.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut payload = read_secrets_json(&path);
    payload.insert(
        field.to_string(),
        serde_json::Value::String(value.to_string()),
    );
    let serialized = serde_json::to_string_pretty(&serde_json::Value::Object(payload))
        .map_err(|e| e.to_string())?;
    fs::write(&path, serialized).map_err(|e| e.to_string())
}

pub(crate) fn persist_groq_api_key(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("La API key no puede estar vacía.".to_string());
    }
    write_secret_field(app, "groq_api_key", trimmed)?;
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.set_password(trimmed);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn save_groq_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    persist_groq_api_key(&app, &key)
}

pub(crate) fn persist_deepgram_api_key(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("La API key no puede estar vacía.".to_string());
    }
    write_secret_field(app, "deepgram_api_key", trimmed)?;
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER_DEEPGRAM) {
        let _ = entry.set_password(trimmed);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn save_deepgram_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    persist_deepgram_api_key(&app, &key)
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

pub(crate) fn load_groq_api_key(state: &AppState) -> Result<String, String> {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        match entry.get_password() {
            Ok(k) if !k.trim().is_empty() => return Ok(k.trim().to_string()),
            Ok(_) => {}
            Err(_) => {}
        }
    }
    groq_key_from_file(&state.secrets_path).ok_or_else(|| {
        "No hay API key de Groq guardada. Pégala en Settings, pulsa Guardar y prueba de nuevo."
            .to_string()
    })
}

fn deepgram_key_from_file(secrets_path: &Path) -> Option<String> {
    let raw = fs::read_to_string(secrets_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value
        .get("deepgram_api_key")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn load_deepgram_api_key(state: &AppState) -> Result<String, String> {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER_DEEPGRAM) {
        match entry.get_password() {
            Ok(k) if !k.trim().is_empty() => return Ok(k.trim().to_string()),
            Ok(_) => {}
            Err(_) => {}
        }
    }
    deepgram_key_from_file(&state.secrets_path).ok_or_else(|| {
        "No hay API key de Deepgram guardada. Pégala en Settings, pulsa Guardar y prueba de nuevo."
            .to_string()
    })
}

/// Canjea un cupón contra `MUSHU_REDEEM_URL` (POST JSON `{ "code": "..." }` → `{ "groq_api_key": "..." }`).
#[tauri::command]
pub(crate) async fn redeem_groq_coupon(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    code: String,
) -> Result<(), String> {
    let url = std::env::var("MUSHU_REDEEM_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_REDEEM_URL.to_string());
    let url = url.as_str();
    let trimmed = code.trim().to_string();
    if trimmed.is_empty() {
        return Err("Escribe un código de cupón.".to_string());
    }
    if trimmed.len() > 64
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(
            "Formato de cupón no válido (usa letras, números, guiones o guiones bajos)."
                .to_string(),
        );
    }

    let client = state.llm_client.clone();
    let body = serde_json::json!({ "code": trimmed });
    let response =
        tokio::time::timeout(Duration::from_secs(25), client.post(url).json(&body).send())
            .await
            .map_err(|_| {
                "Tiempo de espera agotado al contactar el servicio de cupones.".to_string()
            })?
            .map_err(|e| format!("No se pudo contactar el servicio de cupones: {e}"))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if status.is_success() {
        let parsed: RedeemGroqResponse =
            serde_json::from_str(&text).map_err(|_| {
                "El servidor de cupones respondió pero el formato no es el esperado (falta groq_api_key)."
                    .to_string()
            })?;
        let key = parsed.groq_api_key.trim();
        if key.is_empty() {
            return Err("El servidor devolvió una API key vacía.".to_string());
        }
        persist_groq_api_key(&app, key)?;
        Ok(())
    } else {
        let msg = if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            v.get("message")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("Cupón no válido (HTTP {}).", status.as_u16()))
        } else {
            format!("Cupón no válido (HTTP {}).", status.as_u16())
        };
        Err(msg)
    }
}

/// Verifica que la API key de Deepgram sea válida con un GET a /v1/projects.
#[tauri::command]
pub(crate) async fn test_deepgram(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let key = load_deepgram_api_key(&state)?;
    let response = tokio::time::timeout(
        Duration::from_secs(5),
        state
            .llm_client
            .get("https://api.deepgram.com/v1/projects")
            .header("Authorization", format!("Token {key}"))
            .send(),
    )
    .await
    .map_err(|_| "Timeout de Deepgram".to_string())?
    .map_err(|e| e.to_string())?;
    let status = response.status();
    if status.is_success() {
        Ok(format!("Deepgram respondió correctamente (HTTP {status})."))
    } else {
        Err(format!(
            "Deepgram rechazó la API key (HTTP {}). Verifica que sea válida.",
            status.as_u16()
        ))
    }
}
