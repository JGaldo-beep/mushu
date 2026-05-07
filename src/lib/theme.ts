import type { ThemePref } from "./types";

/**
 * Mushu is a light-only app. The theme preference still exists in the settings
 * payload (backend compat), but the UI never applies the `.dark` class.
 */
export function resolveTheme(_pref: ThemePref): "light" {
  return "light";
}

export function applyTheme(_pref: ThemePref) {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.dataset.theme = "light";
}

export function watchSystemTheme(_onChange: () => void) {
  return () => {};
}
