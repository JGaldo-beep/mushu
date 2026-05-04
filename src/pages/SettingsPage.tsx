import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  ChevronDown,
  Keyboard,
  Lock,
  RefreshCw,
  Save,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ShortcutKbd } from "@/components/ShortcutKbd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { tauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { ProcessingMode } from "@/lib/types";

const MODELS = [
  { value: "llama-3.1-8b-instant", label: "Rápido (Llama 3.1 · 8B)" },
  { value: "llama-3.3-70b-versatile", label: "Calidad (Llama 3.3 · 70B)" },
];

const PROCESSING_MODES: { value: ProcessingMode; label: string; description: string }[] = [
  {
    value: "cloud_first",
    label: "Nube primero",
    description: "Usa Groq cuando esté disponible; cae en local si falla.",
  },
  {
    value: "local_only",
    label: "Solo local",
    description: "Whisper local, sin Groq. Modos avanzados deshabilitados.",
  },
];

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Icon className="size-3.5 text-muted-foreground" strokeWidth={2} />
          {title}
        </h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  htmlFor,
  control,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 p-3">
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  const { draft, loading, saving, isDirty, setField, save, reset, refresh } = useSettings();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groqKeyDraft, setGroqKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);

  if (loading || !draft) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando ajustes…</p>
      </div>
    );
  }

  const onSave = async () => {
    try {
      await save();
      toast.success("Ajustes guardados");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSaveKey = async () => {
    const k = groqKeyDraft.trim();
    if (!k) return;
    setSavingKey(true);
    try {
      await tauri.saveGroqApiKey(k);
      setGroqKeyDraft("");
      toast.success("Clave de Groq guardada");
      await refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSavingKey(false);
    }
  };

  const onTestGroq = async () => {
    setTestingGroq(true);
    try {
      const msg = await tauri.testGroq();
      toast.success(msg || "Conexión correcta");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTestingGroq(false);
    }
  };

  const onRefreshMics = async () => {
    await refresh();
    toast.success("Lista de micrófonos actualizada");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-background/40 px-6 py-5 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tus preferencias se guardan en este equipo.
          </p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl space-y-7 px-6 py-6 pb-32">
          <Section
            title="Audio"
            description="Sonidos de inicio/fin de grabación y micrófono."
            icon={Volume2}
          >
            <Row
              label="Efectos de sonido"
              description="Pequeño chime al empezar y terminar la grabación."
              control={
                <Switch
                  checked={draft.sound_effects_enabled}
                  onCheckedChange={(v) => setField("sound_effects_enabled", v)}
                />
              }
            />
            <Row
              label="Volumen de los sonidos"
              control={
                <div className="flex w-48 items-center gap-2">
                  <Slider
                    value={[Math.round(draft.sound_effects_volume * 100)]}
                    onValueChange={(v) => setField("sound_effects_volume", (v[0] ?? 0) / 100)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!draft.sound_effects_enabled}
                  />
                  <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
                    {Math.round(draft.sound_effects_volume * 100)}%
                  </span>
                </div>
              }
            />
            <Row
              label="Micrófono"
              description="Predeterminado de Windows si no eliges uno."
              control={
                <div className="flex items-center gap-2">
                  <Select
                    value={draft.selected_microphone ?? "__default__"}
                    onValueChange={(v) =>
                      setField("selected_microphone", v === "__default__" ? null : v)
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Predeterminado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Predeterminado de Windows</SelectItem>
                      {draft.microphones.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onRefreshMics}
                    title="Actualizar lista"
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </div>
              }
            />
          </Section>

          <Separator />

          <Section
            title="Modelo de IA"
            description="Cómo se procesa tu voz antes de pegar el texto."
            icon={Brain}
          >
            <Row
              label="Modelo"
              control={
                <Select value={draft.model} onValueChange={(v) => setField("model", v)}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <Row
              label="Modo de procesamiento"
              description={
                PROCESSING_MODES.find((m) => m.value === draft.processing_mode)?.description
              }
              control={
                <Select
                  value={draft.processing_mode}
                  onValueChange={(v) => setField("processing_mode", v as ProcessingMode)}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCESSING_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          </Section>

          <Separator />

          <Section
            title="Atajos de teclado"
            description="Atajos globales que funcionan desde cualquier app."
            icon={Keyboard}
          >
            <Row
              label="Dictar"
              description={
                <span className="inline-flex items-center gap-1.5">
                  Actual: <ShortcutKbd keys={draft.hotkey.split("+")} size="sm" />
                </span>
              }
              htmlFor="hotkey"
              control={
                <Input
                  id="hotkey"
                  value={draft.hotkey}
                  onChange={(e) => setField("hotkey", e.target.value)}
                  placeholder="Ctrl+Space"
                  className="w-48 font-mono text-xs"
                />
              }
            />
            <Row
              label="Cambiar modo"
              description={
                <span className="inline-flex items-center gap-1.5">
                  Actual: <ShortcutKbd keys={draft.mode_hotkey.split("+")} size="sm" />
                </span>
              }
              htmlFor="mode_hotkey"
              control={
                <Input
                  id="mode_hotkey"
                  value={draft.mode_hotkey}
                  onChange={(e) => setField("mode_hotkey", e.target.value)}
                  placeholder="Ctrl+Shift+Space"
                  className="w-48 font-mono text-xs"
                />
              }
            />
          </Section>

          <Separator />

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-background/30 px-4 py-3 text-sm font-medium transition-colors",
                  "hover:bg-background/60 hover:border-border",
                )}
              >
                <span className="flex items-center gap-2">
                  <Lock className="size-3.5 text-muted-foreground" strokeWidth={2} />
                  Configuración avanzada
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    advancedOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
              <div className="mt-3 space-y-3 rounded-lg border border-border bg-background/40 p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="groq-key" className="text-sm font-medium">
                      Clave API de Groq
                    </Label>
                    {draft.has_groq_key && (
                      <Badge variant="secondary" className="text-[10px]">
                        Configurada
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Necesaria solo para los modos avanzados (Pregunta a Mushu, Responder en
                    inglés, Traducir). Se guarda cifrada en el llavero del sistema.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="groq-key"
                      type="password"
                      value={groqKeyDraft}
                      onChange={(e) => setGroqKeyDraft(e.target.value)}
                      placeholder={draft.has_groq_key ? "•••••••• (escribe para reemplazar)" : "gsk_..."}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      onClick={onSaveKey}
                      disabled={!groqKeyDraft.trim() || savingKey}
                      size="sm"
                    >
                      {savingKey ? "Guardando…" : "Guardar"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[11px] text-muted-foreground">
                      ¿Funciona la conexión con Groq?
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onTestGroq}
                      disabled={!draft.has_groq_key || testingGroq}
                    >
                      {testingGroq ? "Probando…" : "Probar conexión"}
                    </Button>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.33, 1, 0.68, 1] }}
            className="border-t border-border bg-background/95 backdrop-blur"
          >
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3">
              <p className="text-xs text-muted-foreground">Tienes cambios sin guardar.</p>
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
