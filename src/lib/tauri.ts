import { invoke } from "@tauri-apps/api/core";
import type { FrontendState, HistoryItem, ModeName, SaveSettingsInput } from "./types";

export const tauri = {
  getFrontendState: () => invoke<FrontendState>("get_frontend_state"),
  completeOnboarding: () => invoke<FrontendState>("complete_onboarding"),
  saveSettings: (input: SaveSettingsInput) => invoke<FrontendState>("save_settings", { input }),
  saveGroqApiKey: (key: string) => invoke<void>("save_groq_api_key", { key }),
  redeemGroqCoupon: (code: string) => invoke<void>("redeem_groq_coupon", { code }),
  testGroq: () => invoke<string>("test_groq"),
  getHistory: () => invoke<HistoryItem[]>("get_history"),
  clearHistory: () => invoke<void>("clear_history"),
  copyToClipboard: (text: string) => invoke<void>("copy_to_clipboard", { text }),
  setMode: (mode: ModeName) => invoke<void>("set_mode", { mode }),
};
