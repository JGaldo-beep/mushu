import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import type { ThemePref } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePref; icon: LucideIcon; label: string }[] = [
  { value: "system", icon: Monitor, label: "Auto" },
  { value: "light", icon: Sun, label: "Claro" },
  { value: "dark", icon: Moon, label: "Oscuro" },
];

export function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemePref;
  onChange: (next: ThemePref) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Tema"
      className="grid grid-cols-3 gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {OPTIONS.map(({ value: v, icon: Icon, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            aria-label={`Tema ${label.toLowerCase()}`}
            title={label}
            onClick={() => onChange(v)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
