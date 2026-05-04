import type { CSSProperties } from "react";
import { MODE_ICONS } from "@/lib/modes";
import type { ModeInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModeBadge({ mode, className }: { mode: ModeInfo; className?: string }) {
  const Icon = MODE_ICONS[mode.icon] ?? MODE_ICONS.Mic;
  return (
    <div
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium leading-none tracking-[-0.01em]",
        "overlay-mode-pop",
        className,
      )}
      style={
        {
          "--mode-color": mode.color,
          background: "color-mix(in oklch, var(--mode-color) 14%, transparent)",
          border: "1px solid color-mix(in oklch, var(--mode-color) 40%, transparent)",
        } as CSSProperties
      }
    >
      <Icon className="size-3.5 shrink-0" style={{ color: "var(--mode-color)" }} strokeWidth={2.25} />
      <span className="overlay-mode-chip-label truncate">{mode.label}</span>
    </div>
  );
}
