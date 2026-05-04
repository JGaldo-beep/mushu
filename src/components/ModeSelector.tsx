import { MODE_COLORS, MODE_ICONS, MODE_ICONS_BY_NAME, MODE_LABELS, MODE_NAMES } from "@/lib/modes";
import type { ModeName } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModeSelector({
  active,
  onChange,
  disabled,
}: {
  active: ModeName;
  onChange: (next: ModeName) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Modos" className="grid grid-cols-4 gap-1.5">
      {MODE_NAMES.map((name) => {
        const Icon = MODE_ICONS[MODE_ICONS_BY_NAME[name]];
        const isActive = active === name;
        const color = MODE_COLORS[name];
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(name)}
            title={MODE_LABELS[name]}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-all",
              "hover:-translate-y-0.5 hover:shadow-sm",
              "disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none",
              isActive
                ? "bg-primary/5 shadow-sm"
                : "border-border bg-background/60 hover:border-border/80",
            )}
            style={isActive ? { borderColor: `${color}66`, backgroundColor: `${color}10` } : undefined}
          >
            <Icon
              className="size-4"
              style={{ color: isActive ? color : undefined }}
              strokeWidth={isActive ? 2.25 : 2}
            />
            <span
              className={cn(
                "text-center text-[10.5px] font-medium leading-tight",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {MODE_LABELS[name]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
