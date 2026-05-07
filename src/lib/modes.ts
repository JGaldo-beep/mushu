import { Mail, Mic, StickyNote, type LucideIcon } from "lucide-react";
import type { ModeIconName, ModeInfo, ModeName } from "./types";

export const MODE_ICONS: Record<ModeIconName, LucideIcon> = {
  Mic,
  Mail,
  StickyNote,
};

export const MODE_LABELS: Record<ModeName, string> = {
  DEFAULT: "General",
  EMAIL: "Correo",
  NOTE: "Nota",
};

export const MODE_DESCRIPTIONS: Record<ModeName, string> = {
  DEFAULT: "Transcripción limpia, sin retoques.",
  EMAIL: "Tono formal y párrafos estructurados.",
  NOTE: "Casual, viñetas y fragmentos permitidos.",
};

export const MODE_COLORS: Record<ModeName, string> = {
  DEFAULT: "#d1ff3a",
  EMAIL: "#5fb5d8",
  NOTE: "#cfc0e5",
};

export const MODE_ICONS_BY_NAME: Record<ModeName, ModeIconName> = {
  DEFAULT: "Mic",
  EMAIL: "Mail",
  NOTE: "StickyNote",
};

export const MODE_NAMES: ModeName[] = ["DEFAULT", "EMAIL", "NOTE"];

export const DEFAULT_MODE: ModeInfo = {
  name: "DEFAULT",
  label: MODE_LABELS.DEFAULT,
  color: MODE_COLORS.DEFAULT,
  icon: "Mic",
};

const KNOWN_MODES = new Set<string>(MODE_NAMES);

/** Returns a fully-populated ModeInfo, falling back to DEFAULT for unknown names. */
export function normalizeMode(m: Partial<ModeInfo> & { name?: string }): ModeInfo {
  const name = (m.name && KNOWN_MODES.has(m.name) ? m.name : "DEFAULT") as ModeName;
  return {
    name,
    label: m.label || MODE_LABELS[name],
    color: m.color || MODE_COLORS[name],
    icon: m.icon || MODE_ICONS_BY_NAME[name],
  };
}

/** Display label for any mode string (including legacy ones from old history). */
export function modeLabel(name: string): string {
  if (name in MODE_LABELS) return MODE_LABELS[name as ModeName];
  return name; // legacy / unknown — show raw
}

/** Display color for any mode string. */
export function modeColor(name: string): string {
  if (name in MODE_COLORS) return MODE_COLORS[name as ModeName];
  return "#8a8a95";
}
