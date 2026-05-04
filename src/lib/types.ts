export type ModeName =
  | "DEFAULT"
  | "EMAIL"
  | "FORMAL"
  | "CASUAL"
  | "CODE"
  | "HELP"
  | "REPLY_EN"
  | "EXPLAIN"
  /** Historial guardado antes del cambio de modo */
  | "TRANSLATE";

export type ModeIconName =
  | "Mic"
  | "Mail"
  | "BriefcaseBusiness"
  | "MessageCircle"
  | "Code2"
  | "CircleHelp"
  | "MessageSquareReply"
  | "Languages"
  | "BookOpen";

export type ModeInfo = {
  name: ModeName;
  label: string;
  color: string;
  icon: ModeIconName;
};

export type ThemePref = "system" | "light" | "dark";

export type ProcessingMode = "cloud_first" | "local_only";

export type FrontendState = {
  mode: ModeInfo;
  hotkey: string;
  mode_hotkey: string;
  model: string;
  processing_mode: ProcessingMode;
  has_groq_key: boolean;
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
  model: string;
  processing_mode: ProcessingMode;
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
  mode_used: ModeName;
  duration_ms: number;
};

export type DictationLatencyPayload = {
  whisper_ms: number;
  llm_ms: number;
  paste_ms: number;
  total_ms: number;
  phase: string;
};

export type NavSection = "home" | "history" | "settings";
