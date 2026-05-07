import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Info,
  Keyboard,
  LifeBuoy,
  Mic,
  RefreshCw,
  Save,
  ShieldCheck,
  Volume2,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { GlassSelect } from "@/components/GlassSelect";
import { GlassToggle } from "@/components/GlassToggle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Slider } from "@/components/ui/slider";
import { useSettings } from "@/hooks/useSettings";
import { useSpokenLanguage } from "@/hooks/useSpokenLanguage";
import { tauri } from "@/lib/tauri";

const APP_VERSION = "0.1.1";

const LANGUAGES = [
  { value: "auto", label: "Detectar automáticamente" },
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "fr", label: "Francés" },
  { value: "de", label: "Alemán" },
  { value: "pt", label: "Portugués" },
  { value: "it", label: "Italiano" },
];

function SectionHeader({
  title,
  icon: Icon,
  description,
}: {
  title: string;
  icon: LucideIcon;
  description?: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-2.5 px-4 pt-4 pb-3">
      <Icon style={{ width: "15px", height: "15px", color: "var(--accent-primary)" }} strokeWidth={2.25} />
      <div>
        <p
          style={{
            fontFamily: "'Geist Variable', sans-serif",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.005em",
          }}
        >
          {title}
        </p>
        {description && (
          <p
            style={{
              fontFamily: "'Geist Variable', sans-serif",
              fontSize: "11.5px",
              fontWeight: 450,
              color: "var(--text-muted)",
              marginTop: "1px",
            }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  htmlFor,
  control,
  isLast,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  control: ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3"
      style={!isLast ? { borderBottom: "0.5px solid var(--glass-border-outer)" } : undefined}
    >
      <div className="min-w-0 flex-1">
        <Label
          htmlFor={htmlFor}
          style={{
            fontFamily: "'Geist Variable', sans-serif",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {label}
        </Label>
        {description && (
          <div
            style={{
              fontFamily: "'Geist Variable', sans-serif",
              fontSize: "11.5px",
              fontWeight: 450,
              color: "var(--text-muted)",
              marginTop: "2px",
            }}
          >
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

const PROVIDER_OPTIONS = [
  { value: "groq", label: "Groq (HTTP, post-grabación)" },
  { value: "deepgram", label: "Deepgram (WebSocket streaming)" },
];

export function SettingsPage() {
  const { draft, loading, saving, isDirty, setField, save, reset, refresh } = useSettings();
  const { language, setLanguage } = useSpokenLanguage();
  const [deepgramKey, setDeepgramKey] = useState("");
  const [savingDeepgram, setSavingDeepgram] = useState(false);
  const ready = !loading && !!draft;
  const showDeepgramWarning =
    ready && draft!.transcription_provider === "deepgram" && !draft!.has_deepgram_key;

  const onSaveDeepgramKey = async () => {
    const key = deepgramKey.trim();
    if (!key) {
      toast.error("Pega tu API key primero");
      return;
    }
    setSavingDeepgram(true);
    try {
      await tauri.saveDeepgramApiKey(key);
      setDeepgramKey("");
      await refresh();
      toast.success("API key de Deepgram guardada");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSavingDeepgram(false);
    }
  };

  const onTestDeepgram = async () => {
    try {
      const msg = await tauri.testDeepgram();
      toast.success(msg);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSave = async () => {
    try {
      await save();
      toast.success("Ajustes guardados");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onRefreshMics = async () => {
    await refresh();
    toast.success("Lista de micrófonos actualizada");
  };

  const micOptions = ready
    ? [
        { value: "__default__", label: "Predeterminado del sistema" },
        ...draft!.microphones.map((m) => ({ value: m, label: m })),
      ]
    : [{ value: "__default__", label: "Predeterminado del sistema" }];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mushu-topbar flex items-center gap-3 px-5 py-3" style={{ flexShrink: 0 }}>
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
            Ajustes
          </p>
          <p
            style={{
              fontFamily: "'Geist Variable', sans-serif",
              fontSize: "12px",
              fontWeight: 450,
              color: "var(--text-muted)",
            }}
          >
            Tus preferencias se guardan en este equipo
          </p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div
          className="mx-auto max-w-2xl space-y-4 px-5 py-5 pb-32"
          style={{
            opacity: ready ? 1 : 0.55,
            pointerEvents: ready ? "auto" : "none",
            transition: "opacity 0.18s ease-out",
          }}
        >
          {/* General */}
          <GlassCard className="overflow-hidden">
            <SectionHeader
              title="General"
              icon={Globe}
              description="Idioma de dictado, ayuda y about"
            />
            <SettingRow
              label="Idioma que hablas"
              description="Mejora la precisión cuando es siempre el mismo idioma."
              control={
                <GlassSelect
                  value={language}
                  options={LANGUAGES}
                  onChange={setLanguage}
                  className="w-56"
                />
              }
            />
            <SettingRow
              label="Ayuda"
              description="Documentación y atajos de Mushu."
              control={
                <a
                  href="https://github.com/JGaldo-beep/mushu"
                  target="_blank"
                  rel="noreferrer"
                  className="glass-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
                  style={{
                    fontFamily: "'Geist Variable', sans-serif",
                    fontSize: "12px",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  <LifeBuoy size={13} strokeWidth={2} />
                  Abrir
                  <ExternalLink size={11} strokeWidth={2} />
                </a>
              }
            />
            <SettingRow
              label="Acerca de Mushu"
              description={
                <span className="inline-flex items-center gap-2">
                  <Info size={12} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px" }}>
                    v{APP_VERSION} · Tauri + React
                  </span>
                </span>
              }
              isLast
              control={null}
            />
          </GlassCard>

          {/* Recording */}
          <GlassCard className="overflow-hidden">
            <SectionHeader
              title="Grabación"
              icon={Mic}
              description="Micrófono y feedback sonoro"
            />
            <SettingRow
              label="Micrófono"
              description="Predeterminado del sistema si no eliges uno."
              control={
                <div className="flex items-center gap-2">
                  <GlassSelect
                    value={draft?.selected_microphone ?? "__default__"}
                    options={micOptions}
                    onChange={(v) => setField("selected_microphone", v === "__default__" ? null : v)}
                    className="w-56"
                  />
                  <button
                    type="button"
                    className="glass-btn rounded-lg p-2"
                    onClick={onRefreshMics}
                    title="Actualizar lista"
                  >
                    <RefreshCw style={{ width: "14px", height: "14px" }} />
                  </button>
                </div>
              }
            />
            <SettingRow
              label="Efectos de sonido"
              description="Chime al empezar y terminar la grabación."
              control={
                <GlassToggle
                  value={draft?.sound_effects_enabled ?? true}
                  onChange={(v) => setField("sound_effects_enabled", v)}
                />
              }
            />
            <SettingRow
              label="Volumen"
              isLast
              control={
                <div className="flex w-44 items-center gap-2">
                  <Slider
                    value={[Math.round((draft?.sound_effects_volume ?? 0) * 100)]}
                    onValueChange={(v) => setField("sound_effects_volume", (v[0] ?? 0) / 100)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!draft?.sound_effects_enabled}
                  />
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      width: "32px",
                      textAlign: "right",
                    }}
                  >
                    {Math.round((draft?.sound_effects_volume ?? 0) * 100)}%
                  </span>
                </div>
              }
            />
          </GlassCard>

          {/* Transcription */}
          <GlassCard className="overflow-hidden">
            <SectionHeader
              title="Transcripción"
              icon={Waves}
              description="Proveedor de speech-to-text y credenciales"
            />
            <SettingRow
              label="Proveedor"
              description={
                draft?.transcription_provider === "deepgram"
                  ? "Streaming WebSocket: el audio se transcribe mientras hablas (latencia mínima al soltar)."
                  : "HTTP tradicional: sube el archivo al soltar y espera la respuesta."
              }
              control={
                <GlassSelect
                  value={draft?.transcription_provider ?? "groq"}
                  options={PROVIDER_OPTIONS}
                  onChange={(v) =>
                    setField("transcription_provider", v as "groq" | "deepgram")
                  }
                  className="w-72"
                />
              }
            />
            <SettingRow
              label="Deepgram API Key"
              description={
                draft?.has_deepgram_key ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2
                      size={11}
                      strokeWidth={2.5}
                      style={{ color: "var(--delta-green)" }}
                    />
                    <span>Guardada en este equipo</span>
                  </span>
                ) : (
                  "Crea una en console.deepgram.com → API keys."
                )
              }
              isLast={!showDeepgramWarning}
              control={
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={deepgramKey}
                    onChange={(e) => setDeepgramKey(e.target.value)}
                    placeholder="dg_..."
                    className="glass-input rounded-lg"
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "12px",
                      padding: "6px 10px",
                      width: "200px",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={onSaveDeepgramKey}
                    disabled={savingDeepgram || !deepgramKey.trim()}
                    className="glass-btn rounded-lg px-3 py-1.5"
                    style={{
                      fontFamily: "'Geist Variable', sans-serif",
                      fontSize: "12px",
                      fontWeight: 600,
                      opacity: savingDeepgram || !deepgramKey.trim() ? 0.55 : 1,
                      cursor: savingDeepgram || !deepgramKey.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {savingDeepgram ? "Guardando…" : "Guardar"}
                  </button>
                  {draft?.has_deepgram_key && (
                    <button
                      type="button"
                      onClick={onTestDeepgram}
                      className="glass-btn rounded-lg px-3 py-1.5"
                      style={{
                        fontFamily: "'Geist Variable', sans-serif",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      Probar
                    </button>
                  )}
                </div>
              }
            />
            {showDeepgramWarning && (
              <div
                className="mx-4 mb-3 rounded-lg px-3 py-2"
                style={{
                  fontFamily: "'Geist Variable', sans-serif",
                  fontSize: "11.5px",
                  background: "rgba(251,146,60,0.08)",
                  border: "0.5px solid rgba(251,146,60,0.30)",
                  color: "var(--text-secondary)",
                }}
              >
                Has elegido Deepgram pero aún no hay API key. Mientras tanto, el dictado caerá automáticamente a Groq HTTP.
              </div>
            )}
          </GlassCard>

          {/* Shortcuts */}
          <GlassCard className="overflow-hidden">
            <SectionHeader
              title="Atajos"
              icon={Keyboard}
              description="Atajos globales que funcionan desde cualquier app"
            />
            <SettingRow
              label="Dictado"
              description="Mantén pulsado para push-to-talk; tap rápido para entrar a hands-off (otro tap o ESC para terminar)."
              htmlFor="hotkey"
              control={
                <input
                  id="hotkey"
                  value={draft?.hotkey ?? ""}
                  onChange={(e) => setField("hotkey", e.target.value)}
                  placeholder="Ctrl+Space"
                  className="glass-input rounded-lg"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "6px 10px",
                    width: "160px",
                    outline: "none",
                  }}
                />
              }
            />
            <SettingRow
              label="Agent Mode"
              description="Atajo para ejecutar comandos sobre texto seleccionado."
              htmlFor="mode_hotkey"
              control={
                <input
                  id="mode_hotkey"
                  value={draft?.mode_hotkey ?? ""}
                  onChange={(e) => setField("mode_hotkey", e.target.value)}
                  placeholder="Ctrl+Shift+M"
                  className="glass-input rounded-lg"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "6px 10px",
                    width: "160px",
                    outline: "none",
                  }}
                />
              }
            />
            <SettingRow
              label="Pausa"
              description="Pausa la grabación sin terminarla. Otro tap reanuda."
              htmlFor="pause_hotkey"
              isLast
              control={
                <input
                  id="pause_hotkey"
                  value={draft?.pause_hotkey ?? ""}
                  onChange={(e) => setField("pause_hotkey", e.target.value)}
                  placeholder="Ctrl+Shift+P"
                  className="glass-input rounded-lg"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "6px 10px",
                    width: "160px",
                    outline: "none",
                  }}
                />
              }
            />
          </GlassCard>

          {/* Permissions */}
          <GlassCard className="overflow-hidden">
            <SectionHeader
              title="Permisos"
              icon={ShieldCheck}
              description="Acceso al hardware y al sistema"
            />
            <SettingRow
              label="Micrófono"
              description="Necesario para capturar tu voz. Si Mushu no escucha, revisa los permisos del sistema."
              isLast
              control={
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "10px",
                    fontWeight: 700,
                    background: "rgba(22,163,74,0.10)",
                    border: "0.5px solid rgba(22,163,74,0.30)",
                    color: "var(--delta-green)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  <Volume2 size={11} strokeWidth={2.5} />
                  Concedido
                </span>
              }
            />
          </GlassCard>
        </div>
      </ScrollArea>

      {/* Unsaved changes bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.33, 1, 0.68, 1] }}
            style={{
              background: "oklch(13% 0.08 209 / 0.94)",
              borderTop: "0.5px solid var(--glass-border)",
              backdropFilter: "blur(20px) saturate(140%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 -8px 24px rgba(0,0,0,0.30)",
            }}
          >
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3">
              <p
                style={{
                  fontFamily: "'Geist Variable', sans-serif",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                Tienes cambios sin guardar.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                  Descartar
                </Button>
                <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
                  <Save className="size-3.5" strokeWidth={2.25} />
                  {saving ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
