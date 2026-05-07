export type ModeName = "DEFAULT" | "EMAIL" | "NOTE";

export type ModeIconName = "Mic" | "Mail" | "StickyNote";

export type ModeInfo = {
  name: ModeName;
  label: string;
  color: string;
  icon: ModeIconName;
};

export type ThemePref = "system" | "light" | "dark";

export type ProcessingMode = "cloud_first" | "local_only";

export type TranscriptionProvider = "groq" | "deepgram";

export type FrontendState = {
  mode: ModeInfo;
  hotkey: string;
  mode_hotkey: string;
  pause_hotkey: string;
  model: string;
  processing_mode: ProcessingMode;
  transcription_provider: TranscriptionProvider;
  has_groq_key: boolean;
  has_deepgram_key: boolean;
  microphones: string[];
  selected_microphone: string | null;
  theme: ThemePref;
  sound_effects_enabled: boolean;
  sound_effects_volume: number;
  onboarding_completed: boolean;
};

export type SaveSettingsInput = {
  hotkey: string;
  mode_hotkey: string;
  pause_hotkey: string;
  model: string;
  processing_mode: ProcessingMode;
  transcription_provider: TranscriptionProvider;
  microphone: string | null;
  theme: ThemePref;
  sound_effects_enabled: boolean;
  sound_effects_volume: number;
};

export type HistoryItem = {
  id: number;
  timestamp: string;
  raw_text: string;
  processed_text: string;
  mode_used: ModeName | string;
  duration_ms: number;
};

export type DictationLatencyPayload = {
  whisper_ms: number;
  llm_ms: number;
  paste_ms: number;
  total_ms: number;
  phase: string;
};

export type NavSection = "home" | "modes" | "ai-features" | "settings" | "account";
