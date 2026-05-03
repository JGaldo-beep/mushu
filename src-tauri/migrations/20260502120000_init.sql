CREATE TABLE IF NOT EXISTS transcription_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  processed_text TEXT NOT NULL,
  mode_used TEXT NOT NULL,
  duration_ms INTEGER NOT NULL
);
