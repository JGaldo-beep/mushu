import { useState, type CSSProperties } from "react";
import { ShortcutKbd } from "@/components/ShortcutKbd";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tauri } from "@/lib/tauri";
import type { NavSection } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEP_COUNT = 5;
const GROQ_KEYS_URL = "https://console.groq.com/keys";
const CONFETTI_COLORS = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#f43f5e", "#14b8a6"];
type ConfettiStyle = CSSProperties & {
  "--tx": string;
  "--ty": string;
  "--rot": string;
};

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
  const [couponCode, setCouponCode] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [confettiSeed, setConfettiSeed] = useState(0);
  const [couponRedeemed, setCouponRedeemed] = useState(false);
  const effectiveHasGroqKey = hasGroqKey || couponRedeemed;

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

  const handleRedeemCoupon = async () => {
    setRedeemError(null);
    setRedeemSuccess(false);
    setRedeeming(true);
    try {
      await tauri.redeemGroqCoupon(couponCode);
      setRedeemSuccess(true);
      setCouponRedeemed(true);
      setCouponCode("");
      setConfettiSeed((s) => s + 1);
    } catch (e) {
      setRedeemError(String(e));
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <Card className="relative w-full max-w-lg border-border/80 p-6 shadow-lg">
        {confettiSeed > 0 ? <ConfettiBurst key={confettiSeed} /> : null}
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
              {effectiveHasGroqKey ? (
                <p>Ya tienes una clave API de Groq guardada. Los modos que usan la nube estarán listos.</p>
              ) : (
                <div className="space-y-4">
                  <p>
                    Para modos que usan la nube (ayuda, responder en inglés, explicar selección…), necesitas una{" "}
                    <strong className="text-foreground">API key de Groq</strong>.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sin clave, el dictado local y los modos solo locales siguen funcionando.
                  </p>

                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    <p className="text-xs font-medium text-foreground">¿Tienes un cupón?</p>
                    <div className="space-y-2">
                      <Label htmlFor="onboarding-coupon" className="text-xs">
                        Código de cupón
                      </Label>
                      <Input
                        id="onboarding-coupon"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="ej. 1023-XABE"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        disabled={redeeming || busy}
                        className="font-mono text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || redeeming || !couponCode.trim()}
                      onClick={() => void handleRedeemCoupon()}
                    >
                      {redeeming ? "Reclamando…" : "Reclamar cupón"}
                    </Button>
                    {redeemSuccess ? (
                      <p className="text-xs font-medium text-emerald-600" role="status">
                        Cupón canjeado. Tu clave de Groq quedó guardada.
                      </p>
                    ) : null}
                    {redeemError ? (
                      <p className="text-xs text-destructive" role="alert">
                        {redeemError}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-dashed border-border/80 p-3 space-y-2">
                    <p className="text-xs font-medium text-foreground">Sin cupón</p>
                    <p className="text-xs text-muted-foreground">
                      Crea una cuenta en Groq y genera una API key en la consola.
                    </p>
                    <a
                      href={GROQ_KEYS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Abrir console.groq.com (keys)
                    </a>
                    <p className="text-xs text-muted-foreground">
                      Luego pégala en Ajustes (o abre Ajustes desde aquí al terminar el tour).
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    disabled={busy || redeeming}
                    onClick={() => void goSettingsAndFinish()}
                  >
                    Abrir Ajustes y terminar tour
                  </Button>
                </div>
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
              <Button
                type="button"
                size="sm"
                disabled={busy || redeeming}
                onClick={() => setStep((s) => s + 1)}
              >
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

function ConfettiBurst() {
  const particles = Array.from({ length: 24 }, (_, i) => {
    const x = Math.round((Math.random() * 100 - 50) * 10) / 10;
    const y = Math.round((Math.random() * 45 + 55) * 10) / 10;
    const rotate = Math.round(Math.random() * 540 - 270);
    const duration = Math.round((Math.random() * 0.45 + 0.65) * 100) / 100;
    const delay = Math.round(Math.random() * 0.12 * 100) / 100;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    return { x, y, rotate, duration, delay, color };
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {particles.map((p, i) => {
        const confettiStyle: ConfettiStyle = {
          backgroundColor: p.color,
          animationName: "mushu-confetti-burst",
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`,
          animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          animationFillMode: "forwards",
          transform: "translate(-50%, 0)",
          "--tx": `${p.x}vw`,
          "--ty": `${p.y}%`,
          "--rot": `${p.rotate}deg`,
        };
        return (
          <span
            key={`${i}-${p.x}-${p.y}`}
            className="absolute left-1/2 top-12 h-2 w-1 rounded-sm"
            style={confettiStyle}
          />
        );
      })}
      <style>{`
        @keyframes mushu-confetti-burst {
          0% {
            opacity: 0;
            transform: translate(-50%, 0) rotate(0deg) scale(0.7);
          }
          10% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--tx)), var(--ty)) rotate(var(--rot)) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
