import { useState } from "react";
import { ShortcutKbd } from "@/components/ShortcutKbd";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { NavSection } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEP_COUNT = 5;

type Props = {
  hotkey: string;
  modeHotkey: string;
  hasGroqKey: boolean;
  onComplete: () => Promise<void>;
  onNavigateSettings: (section: NavSection) => void;
};

export function OnboardingWizard({
  hotkey,
  modeHotkey,
  hasGroqKey,
  onComplete,
  onNavigateSettings,
}: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const dictationParts = hotkey.split("+");
  const modeParts = modeHotkey.split("+");

  const finish = async () => {
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
    }
  };

  const goSettingsAndFinish = async () => {
    await finish();
    onNavigateSettings("settings");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <Card className="relative w-full max-w-lg border-border/80 p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Paso {step + 1} de {STEP_COUNT}
            </p>
            <h2 id="onboarding-title" className="mt-1 text-lg font-semibold tracking-tight">
              Bienvenido a Mushu
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            disabled={busy}
            onClick={() => void finish()}
          >
            Saltar
          </Button>
        </div>

        <div className="min-h-[200px] text-sm text-muted-foreground">
          {step === 0 && (
            <div className="space-y-3 text-foreground/90">
              <p>
                Mushu transcribe lo que dictas con un <strong className="text-foreground">atajo global</strong> y
                puede reescribir el texto según el modo que elijas (correo, formal, código…).
              </p>
              <p>
                También incluye modos con <strong className="text-foreground">Groq</strong> en la nube y un modo
                para <strong className="text-foreground">explicar</strong> texto seleccionado.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-foreground/90">
                Mantén pulsado el atajo de dictado, habla y suéltalo para procesar. Cambia de modo con el segundo
                atajo (sin abrir la app).
              </p>
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">Dictado</p>
                <ShortcutKbd keys={dictationParts} />
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">Cambiar modo</p>
                <ShortcutKbd keys={modeParts} />
              </div>
              <p className="text-xs">Puedes cambiarlos en Ajustes → Atajos de teclado.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-foreground/90">
              <p>
                La primera vez que grabes, Windows puede pedir permiso para usar el <strong className="text-foreground">micrófono</strong>.
                Acepta la petición para que Mushu escuche el audio.
              </p>
              <p className="text-xs">
                Elige el micrófono correcto en Ajustes si tienes varios dispositivos.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={busy}
                onClick={() => void goSettingsAndFinish()}
              >
                Abrir Ajustes y terminar tour
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-foreground/90">
              {hasGroqKey ? (
                <p>Ya tienes una clave API de Groq guardada. Los modos que usan la nube estarán listos.</p>
              ) : (
                <>
                  <p>
                    Para modos que usan la nube (ayuda, responder en inglés, explicar selección…), necesitas una{" "}
                    <strong className="text-foreground">API key de Groq</strong> en Ajustes.
                  </p>
                  <p className="text-xs">Sin clave, el dictado local y modos solo locales siguen funcionando.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => void goSettingsAndFinish()}
                  >
                    Abrir Ajustes y terminar tour
                  </Button>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-foreground/90">
              <p>Ya puedes probar: mantén el atajo de dictado, habla y suelta.</p>
              <p className="text-xs text-muted-foreground">
                Ajustes finos (tema, sonidos, modelo) están en la barra lateral.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Atrás
          </Button>
          <div className="flex gap-2">
            {step < STEP_COUNT - 1 ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => setStep((s) => s + 1)}>
                Siguiente
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={busy} onClick={() => void finish()}>
                Empezar
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex justify-center gap-1">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                i === step ? "bg-primary" : "bg-muted",
              )}
              aria-hidden
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
