import { Check } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDictation } from "@/hooks/useDictation";
import {
  MODE_COLORS,
  MODE_DESCRIPTIONS,
  MODE_ICONS,
  MODE_ICONS_BY_NAME,
  MODE_LABELS,
  MODE_NAMES,
} from "@/lib/modes";
import type { ModeName } from "@/lib/types";

export function ModesPage() {
  const { mode, setMode } = useDictation();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="mushu-topbar flex items-center justify-between px-5 py-3"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-3">
          <SidebarTrigger style={{ color: "var(--text-secondary)" }} />
          <div>
            <p
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              Modos
            </p>
            <p
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "12px",
                fontWeight: 450,
                color: "var(--text-muted)",
              }}
            >
              Elige cómo se procesa tu dictado
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-3 gap-3">
          {MODE_NAMES.map((name) => {
            const isActive = mode.name === name;
            const Icon = MODE_ICONS[MODE_ICONS_BY_NAME[name as ModeName]];
            const color = MODE_COLORS[name as ModeName];
            const label = MODE_LABELS[name as ModeName];
            const description = MODE_DESCRIPTIONS[name as ModeName];
            return (
              <button
                key={name}
                type="button"
                onClick={() => setMode(name as ModeName).catch(() => {})}
                className="group text-left"
                style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
              >
                <GlassCard
                  variant={isActive ? "strong" : "default"}
                  className="relative flex flex-col gap-3 p-5 transition-all"
                  style={{
                    minHeight: "180px",
                    border: isActive
                      ? `0.5px solid ${color}55`
                      : "0.5px solid var(--glass-border-outer)",
                    boxShadow: isActive
                      ? `inset 0 1px 0 var(--glass-border), 0 0 0 1px ${color}40, 0 8px 24px rgba(0,0,0,0.30)`
                      : "inset 0 1px 0 var(--glass-border), 0 1px 2px rgba(0,0,0,0.20), 0 8px 24px rgba(0,0,0,0.28)",
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "12px",
                        background: `${color}14`,
                        border: `0.5px solid ${color}30`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={20} strokeWidth={2} style={{ color }} />
                    </div>
                    {isActive && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                        style={{
                          background: `${color}14`,
                          border: `0.5px solid ${color}40`,
                          color,
                          fontFamily: "'Space Mono', monospace",
                          fontSize: "9px",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          fontWeight: 700,
                        }}
                      >
                        <Check size={10} strokeWidth={3} />
                        Activo
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3
                      style={{
                        fontFamily: "'Geist Variable', sans-serif",
                        fontSize: "16px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        letterSpacing: "-0.01em",
                        marginBottom: "4px",
                      }}
                    >
                      {label}
                    </h3>
                    <p
                      style={{
                        fontFamily: "'Geist Variable', sans-serif",
                        fontSize: "12.5px",
                        fontWeight: 450,
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      {description}
                    </p>
                  </div>
                </GlassCard>
              </button>
            );
          })}
        </div>

        <p
          className="mt-5"
          style={{
            fontFamily: "'Geist Variable', sans-serif",
            fontSize: "11.5px",
            fontWeight: 450,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          El modo activo se aplica a todas las transcripciones. Para personalizar el comportamiento
          (formato, traducción, agente), abre <strong style={{ color: "var(--text-secondary)", fontWeight: 600 }}>AI Features</strong>.
        </p>
      </div>
    </div>
  );
}
