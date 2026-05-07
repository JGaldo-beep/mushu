import { Languages, Sparkles, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { GlassCard } from "@/components/GlassCard";
import { GlassSelect } from "@/components/GlassSelect";
import { GlassToggle } from "@/components/GlassToggle";
import { ShortcutKbd } from "@/components/ShortcutKbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAIFeatures } from "@/hooks/useAIFeatures";
import { useDictation } from "@/hooks/useDictation";

const LANGUAGES = [
  { value: "en", label: "Inglés" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Francés" },
  { value: "de", label: "Alemán" },
  { value: "pt", label: "Portugués" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "Japonés" },
  { value: "zh", label: "Chino" },
];

export function AIFeaturesPage() {
  const ai = useAIFeatures();
  const { modeHotkey } = useDictation();
  const modeHotkeyParts = modeHotkey.split("+");

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
              AI Features
            </p>
            <p
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "12px",
                fontWeight: 450,
                color: "var(--text-muted)",
              }}
            >
              Capas de IA aplicadas a tus transcripciones
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          <FeatureCard
            icon={Wand2}
            color="#d1ff3a"
            title="AI Formatting"
            description="Refina gramática y puntuación antes de pegar."
            value={ai.formattingEnabled}
            onChange={(v) => ai.setField("formattingEnabled", v)}
          />

          <FeatureCard
            icon={Sparkles}
            color="#7c3aed"
            title="Agent Mode"
            description="Ejecuta un comando sobre el texto seleccionado: resumir, reescribir, explicar."
            value={ai.agentEnabled}
            onChange={(v) => ai.setField("agentEnabled", v)}
            extra={
              ai.agentEnabled ? (
                <div className="flex items-center gap-2 pt-3">
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Atajo
                  </span>
                  <ShortcutKbd keys={modeHotkeyParts} size="sm" />
                </div>
              ) : null
            }
          />

          <FeatureCard
            icon={Languages}
            color="#0891b2"
            title="Auto-translate"
            description="Traduce automáticamente al idioma seleccionado."
            value={ai.autoTranslateEnabled}
            onChange={(v) => ai.setField("autoTranslateEnabled", v)}
            extra={
              ai.autoTranslateEnabled ? (
                <div className="flex items-center gap-3 pt-3">
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Idioma destino
                  </span>
                  <div style={{ minWidth: "180px" }}>
                    <GlassSelect
                      value={ai.autoTranslateTarget}
                      options={LANGUAGES}
                      onChange={(v) => ai.setField("autoTranslateTarget", v)}
                    />
                  </div>
                </div>
              ) : null
            }
          />
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
          Estas funciones se aplican después de la transcripción. La integración con el pipeline
          de backend está en desarrollo.
        </p>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  extra?: ReactNode;
}

function FeatureCard({ icon: Icon, color, title, description, value, onChange, extra }: FeatureCardProps) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start gap-4">
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
            flexShrink: 0,
          }}
        >
          <Icon size={20} strokeWidth={2} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                style={{
                  fontFamily: "'Geist Variable', sans-serif",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.005em",
                  marginBottom: "3px",
                }}
              >
                {title}
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
            <GlassToggle value={value} onChange={onChange} />
          </div>
          {extra}
        </div>
      </div>
    </GlassCard>
  );
}
