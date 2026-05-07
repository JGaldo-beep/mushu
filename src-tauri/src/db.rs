use chrono::Utc;
use serde::Serialize;
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::fs;

use crate::AppState;

pub(crate) static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Serialize, sqlx::FromRow)]
pub(crate) struct HistoryItem {
    pub id: i64,
    pub timestamp: String,
    pub raw_text: String,
    pub processed_text: String,
    pub mode_used: String,
    pub duration_ms: i64,
}

pub(crate) async fn init_db(app: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let data_dir = tauri::Manager::path(app)
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
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

pub(crate) async fn save_history(
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

#[tauri::command]
pub(crate) async fn get_history(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<HistoryItem>, String> {
    sqlx::query_as::<_, HistoryItem>(
        "SELECT id, timestamp, raw_text, processed_text, mode_used, duration_ms
         FROM transcription_history
         ORDER BY id DESC LIMIT 80",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn clear_history(state: tauri::State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM transcription_history")
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
