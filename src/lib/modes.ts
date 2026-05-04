import {
  BriefcaseBusiness,
  CircleHelp,
  Code2,
  Languages,
  Mail,
  MessageCircle,
  MessageSquareReply,
  Mic,
  type LucideIcon,
} from "lucide-react";
import type { ModeIconName, ModeInfo, ModeName } from "./types";

export const MODE_ICONS: Record<ModeIconName, LucideIcon> = {
  Mic,
  Mail,
  BriefcaseBusiness,
  MessageCircle,
  Code2,
  CircleHelp,
  MessageSquareReply,
  Languages,
};

export const MODE_LABELS: Record<ModeName, string> = {
  DEFAULT: "General",
  EMAIL: "Correo",
  FORMAL: "Formal",
  CASUAL: "Casual",
  CODE: "Código",
  HELP: "Pregunta a Mushu",
  REPLY_EN: "Responder (EN)",
  TRANSLATE: "Traducir",
};

export const MODE_COLORS: Record<ModeName, string> = {
  DEFAULT: "#7C3AED",
  EMAIL: "#3B82F6",
  FORMAL: "#8B5CF6",
  CASUAL: "#10B981",
  CODE: "#F59E0B",
  HELP: "#EC4899",
  REPLY_EN: "#06B6D4",
  TRANSLATE: "#A78BFA",
};

export const MODE_ICONS_BY_NAME: Record<ModeName, ModeIconName> = {
  DEFAULT: "Mic",
  EMAIL: "Mail",
  FORMAL: "BriefcaseBusiness",
  CASUAL: "MessageCircle",
  CODE: "Code2",
  HELP: "CircleHelp",
  REPLY_EN: "MessageSquareReply",
  TRANSLATE: "Languages",
};

export const MODE_NAMES: ModeName[] = [
  "DEFAULT",
  "EMAIL",
  "FORMAL",
  "CASUAL",
  "CODE",
  "HELP",
  "REPLY_EN",
  "TRANSLATE",
];

export const DEFAULT_MODE: ModeInfo = {
  name: "DEFAULT",
  label: MODE_LABELS.DEFAULT,
  color: MODE_COLORS.DEFAULT,
  icon: "Mic",
};

export function normalizeMode(m: Partial<ModeInfo> & { name: ModeName }): ModeInfo {
  return {
    name: m.name,
    label: m.label || MODE_LABELS[m.name] || m.name,
    color: m.color || MODE_COLORS[m.name] || "#7C3AED",
    icon: m.icon || MODE_ICONS_BY_NAME[m.name] || "Mic",
  };
}
