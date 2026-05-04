import { AnimatePresence, motion } from "framer-motion";
import { CopyButton } from "@/components/CopyButton";
import { ModeChip } from "@/components/ModeChip";
import { ModeSelector } from "@/components/ModeSelector";
import { ShortcutKbd } from "@/components/ShortcutKbd";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { Card } from "@/components/ui/card";
import { Ripple } from "@/components/ui/ripple";
import { ShineBorder } from "@/components/ui/shine-border";
import { TextAnimate } from "@/components/ui/text-animate";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useDictation } from "@/hooks/useDictation";
import { cn } from "@/lib/utils";

export function HomePage() {
  const { status, mode, hotkey, modeHotkey, resultText, errorMessage, setMode } = useDictation();
  const isRecording = status === "recording";
  const audioLevel = useAudioLevel(isRecording);

  const hotkeyParts = hotkey.split("+");
  const modeHotkeyParts = modeHotkey.split("+");

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-10">
          <AnimatePresence mode="wait">
            {status === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col items-center gap-5 text-center"
              >
                <div className="rounded-full border border-border bg-background/70 px-5 py-2 backdrop-blur">
                  <AnimatedShinyText className="text-sm font-medium">
                    Listo para dictar
                  </AnimatedShinyText>
                </div>
                <ShortcutKbd keys={hotkeyParts} />
                <p className="text-xs text-muted-foreground">Mantén el atajo y habla.</p>
              </motion.div>
            )}

            {status === "recording" && (
              <motion.div
                key="recording"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.22 }}
                className="relative flex h-72 w-full items-center justify-center"
              >
                <Ripple
                  mainCircleSize={120 + audioLevel * 90}
                  mainCircleOpacity={0.16 + audioLevel * 0.45}
                  numCircles={6}
                />
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1 shadow-sm backdrop-blur">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                    </span>
                    <span className="text-xs font-medium">Escuchando…</span>
                  </div>
                  <ShortcutKbd keys={hotkeyParts} />
                  <p className="text-[11px] text-muted-foreground">Suelta para transcribir</p>
                </div>
              </motion.div>
            )}

            {status === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="flex gap-1.5">
                  <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                  <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                  <span className="size-2 animate-bounce rounded-full bg-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Transcribiendo…</p>
              </motion.div>
            )}

            {status === "result" && resultText && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24 }}
                className="w-full"
              >
                <Card className="relative overflow-hidden p-5">
                  <ShineBorder
                    borderWidth={1}
                    duration={6}
                    shineColor={["#047857", "#10b981", "#34d399"]}
                  />
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <ModeChip mode={mode} />
                    <CopyButton text={resultText} />
                  </div>
                  <TextAnimate
                    animation="blurInUp"
                    by="word"
                    duration={0.5}
                    once
                    startOnView={false}
                    className="text-base leading-relaxed text-foreground"
                  >
                    {resultText}
                  </TextAnimate>
                </Card>
              </motion.div>
            )}

            {status === "error" && errorMessage && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="w-full max-w-md"
              >
                <Card className="border-destructive/40 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive">{errorMessage}</p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div
        className={cn(
          "border-t border-border bg-background/40 px-6 py-4 backdrop-blur transition-opacity",
          isRecording && "pointer-events-none opacity-40",
        )}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Modo activo
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>o el atajo</span>
              <ShortcutKbd keys={modeHotkeyParts} size="sm" />
            </div>
          </div>
          <ModeSelector
            active={mode.name}
            onChange={(name) => {
              setMode(name).catch(() => {});
            }}
            disabled={isRecording || status === "processing"}
          />
        </div>
      </div>
    </div>
  );
}
