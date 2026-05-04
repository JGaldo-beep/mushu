import { MODE_ICONS } from "@/lib/modes";
import type { ModeInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModeChip({ mode, className }: { mode: ModeInfo; className?: string }) {
  const Icon = MODE_ICONS[mode.icon] ?? MODE_ICONS.Mic;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur",
        className,
      )}
      style={{ borderColor: `${mode.color}55` }}
    >
      <Icon className="size-3.5" style={{ color: mode.color }} strokeWidth={2.25} />
      <span>{mode.label}</span>
    </div>
  );
}
