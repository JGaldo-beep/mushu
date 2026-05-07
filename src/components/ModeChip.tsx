import { MODE_ICONS } from "@/lib/modes";
import type { ModeInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModeChip({ mode, className }: { mode: ModeInfo; className?: string }) {
  const Icon = MODE_ICONS[mode.icon] ?? MODE_ICONS.Mic;
  return (
    <div
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", className)}
      style={{
        background: `${mode.color}14`,
        border: `0.5px solid ${mode.color}40`,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <Icon
        className="size-3.5"
        style={{ color: mode.color }}
        strokeWidth={2.25}
      />
      <span
        style={{
          fontFamily: "'Geist Variable', sans-serif",
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--text-primary)",
        }}
      >
        {mode.label}
      </span>
    </div>
  );
}
