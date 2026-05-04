import { History, Home, type LucideIcon, Mic, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { NavSection, ThemePref } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV: { value: NavSection; icon: LucideIcon; label: string }[] = [
  { value: "home", icon: Home, label: "Inicio" },
  { value: "history", icon: History, label: "Historial" },
  { value: "settings", icon: Settings, label: "Ajustes" },
];

export function Sidebar({
  section,
  onSectionChange,
  theme,
  onThemeChange,
}: {
  section: NavSection;
  onSectionChange: (next: NavSection) => void;
  theme: ThemePref;
  onThemeChange: (next: ThemePref) => void;
}) {
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-sidebar/60 backdrop-blur">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Mic className="size-[18px]" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold leading-none tracking-tight">Mushu</span>
          <span className="mt-1 text-[11px] text-muted-foreground">Dictado por voz</span>
        </div>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Secciones">
        {NAV.map(({ value, icon: Icon, label }) => {
          const active = section === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSectionChange(value)}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <Separator />

      <div className="flex flex-col gap-3 p-3">
        <ThemeToggle value={theme} onChange={onThemeChange} />
        <div className="flex items-center justify-between px-1">
          <Badge variant="secondary" className="font-mono text-[10px]">
            v0.1.0
          </Badge>
          <span className="text-[10px] text-muted-foreground">Windows · α</span>
        </div>
      </div>
    </aside>
  );
}
