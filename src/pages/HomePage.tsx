import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { tauri } from "@/lib/tauri";
import { GlassCard } from "@/components/GlassCard";
import { MetricCard } from "@/components/MetricCard";
import { ModeChip } from "@/components/ModeChip";
import { ShortcutKbd } from "@/components/ShortcutKbd";
import { ShineBorder } from "@/components/ui/shine-border";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { TextAnimate } from "@/components/ui/text-animate";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useDictation } from "@/hooks/useDictation";
import { useHomeMetrics } from "@/hooks/useHomeMetrics";
import { Skeleton } from "@/components/Skeleton";
import { useHistoryContext } from "@/context/HistoryContext";
import { Ripple } from "@/components/ui/ripple";
import { HistoryPage } from "@/pages/HistoryPage";
import { MODE_COLORS, MODE_ICONS, MODE_ICONS_BY_NAME, MODE_LABELS, MODE_NAMES, modeColor, modeLabel } from "@/lib/modes";
import type { ModeName } from "@/lib/types";

function RowCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await tauri.copyToClipboard(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copiado" : "Copiar"}
      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "8px",
        background: copied ? "rgba(209,255,58,0.14)" : "rgba(255,255,255,0.06)",
        border: copied
          ? "0.5px solid rgba(209,255,58,0.42)"
          : "0.5px solid rgba(255,255,255,0.10)",
        color: copied ? "var(--accent-primary)" : "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s",
      }}
    >
      {copied ? (
        <Check size={13} strokeWidth={2.5} />
      ) : (
        <Copy size={13} strokeWidth={2.25} />
      )}
    </button>
  );
}

function relativeTime(iso: string) {
  const now = new Date();
  const then = new Date(iso);
  const diff = (now.getTime() - then.getTime()) / 1000;
  if (diff < 60) return "ahora mismo";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 2) return "ayer";
  return then.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function HomePage() {
  const { status, mode, hotkey, modeHotkey, resultText, errorMessage, setMode } = useDictation();
  const [modeOpen, setModeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { items, loading } = useHistoryContext();
  const isRecording = status === "recording";
  const audioLevel = useAudioLevel(isRecording);

  const metrics = useHomeMetrics();
  const recentHistory = items.slice(0, 3);

  const hotkeyParts = hotkey.split("+");
  const modeHotkeyParts = modeHotkey.split("+");

  return (
    <div className="flex h-full flex-col" style={{ minHeight: 0 }}>
      {/* Topbar */}
      <div className="mushu-topbar flex items-center justify-between px-5 py-3" style={{ flexShrink: 0 }}>
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
              Inicio
            </p>
            <p
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "12px",
                fontWeight: 450,
                color: "var(--text-muted)",
              }}
            >
              Listo para dictar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Popover open={modeOpen} onOpenChange={setModeOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  background: modeOpen ? "var(--glass-bg-strong)" : "var(--glass-bg)",
                  border: "0.5px solid var(--glass-border-outer)",
                  boxShadow: "inset 0 1px 0 var(--glass-border)",
                  backdropFilter: "blur(8px)",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                <span
                  className="animate-mode-pulse rounded-full"
                  style={{ width: "6px", height: "6px", background: mode.color, flexShrink: 0, display: "block" }}
                />
                <span
                  style={{
                    fontFamily: "'Geist Variable', sans-serif",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {mode.label}
                </span>
                <ChevronDown
                  size={11}
                  strokeWidth={2.5}
                  style={{
                    color: "var(--text-muted)",
                    transition: "transform 0.2s",
                    transform: modeOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              style={{
                background: "oklch(15% 0.08 209 / 0.96)",
                border: "0.5px solid var(--glass-border)",
                backdropFilter: "blur(20px) saturate(140%)",
                WebkitBackdropFilter: "blur(20px) saturate(140%)",
                borderRadius: "14px",
                padding: "14px",
                width: "280px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.45)",
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                  Modo de dictado
                </span>
                <ShortcutKbd keys={modeHotkeyParts} size="sm" />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MODE_NAMES.map((name) => {
                  const Icon = MODE_ICONS[MODE_ICONS_BY_NAME[name as ModeName]];
                  const color = MODE_COLORS[name as ModeName];
                  const label = MODE_LABELS[name as ModeName];
                  const isActive = mode.name === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setMode(name as ModeName).catch(() => {});
                        setModeOpen(false);
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px",
                        padding: "12px 6px 10px",
                        borderRadius: "10px",
                        background: isActive ? `${color}14` : "var(--glass-bg-subtle)",
                        border: isActive ? `0.5px solid ${color}50` : "0.5px solid var(--glass-border-outer)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <Icon
                        size={18}
                        strokeWidth={isActive ? 2.25 : 1.85}
                        style={{ color: isActive ? color : "var(--text-secondary)", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontFamily: "'Geist Variable', sans-serif",
                          fontSize: "11px",
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? color : "var(--text-secondary)",
                          textAlign: "center",
                          lineHeight: 1.2,
                        }}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Metrics grid — 4 cards */}
        <div className="grid grid-cols-4 gap-2.5">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: "78px" }} />
            ))
          ) : (
            <>
              <MetricCard
                label="Palabras hoy"
                value={metrics.wordsToday}
                delta={metrics.wordsTodayDelta ?? undefined}
              />
              <MetricCard
                label="Palabras / sem."
                value={metrics.wordsWeek}
                delta={metrics.wordsWeekDelta ?? undefined}
              />
              <MetricCard
                label="Min. / sem."
                value={metrics.minutesWeek}
                unit="min"
                delta={metrics.minutesWeekDelta ?? undefined}
              />
              <MetricCard
                label="Vel. media"
                value={metrics.velocityToday}
                unit={metrics.velocityToday !== "--" ? "pal/min" : ""}
                delta={metrics.velocityTodayDelta ?? undefined}
              />
            </>
          )}
        </div>

        {/* Recording area */}
        <div className="mt-4">
          <GlassCard
            className="relative flex flex-col items-center justify-center overflow-hidden"
            style={{
              minHeight: "260px",
              padding: "24px",
              background:
                "radial-gradient(circle at 50% 60%, rgba(209,255,58,0.08) 0%, var(--glass-bg) 60%)",
            }}
          >
            <AnimatePresence mode="wait">
              {status === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col items-center gap-5"
                >
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "9.5px",
                      textTransform: "uppercase",
                      letterSpacing: "0.18em",
                      color: "var(--text-muted)",
                      fontWeight: 700,
                    }}
                  >
                    Push-to-talk
                  </span>

                  <div className="flex items-center gap-2">
                    {hotkeyParts.map((k, i) => (
                      <span key={`${k}-${i}`} className="flex items-center gap-2">
                        <kbd
                          className="tabular"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "60px",
                            height: "52px",
                            padding: "0 16px",
                            borderRadius: "12px",
                            fontFamily: "'Space Mono', monospace",
                            fontSize: "16px",
                            fontWeight: 700,
                            color: "var(--text-primary)",
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
                            border: "0.5px solid rgba(255,255,255,0.12)",
                            boxShadow:
                              "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.35)",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {k}
                        </kbd>
                        {i < hotkeyParts.length - 1 && (
                          <span
                            style={{
                              fontFamily: "'Space Mono', monospace",
                              fontSize: "16px",
                              fontWeight: 500,
                              color: "var(--text-muted)",
                            }}
                          >
                            +
                          </span>
                        )}
                      </span>
                    ))}
                  </div>

                  <p
                    style={{
                      fontFamily: "'Geist Variable', sans-serif",
                      fontSize: "13.5px",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      textAlign: "center",
                    }}
                  >
                    Mantén el atajo y habla en cualquier app · suelta para transcribir
                  </p>

                  <div
                    aria-hidden
                    style={{
                      width: "60px",
                      height: "1px",
                      background: "rgba(255,255,255,0.10)",
                    }}
                  />

                  <div className="flex items-center gap-2.5">
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "9.5px",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "var(--text-muted)",
                        fontWeight: 700,
                      }}
                    >
                      Agent Mode
                    </span>
                    <ShortcutKbd keys={modeHotkeyParts} size="sm" />
                  </div>
                </motion.div>
              )}

              {status === "recording" && (
                <motion.div
                  key="recording"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.22 }}
                  className="relative flex h-64 w-full items-center justify-center"
                >
                  <Ripple
                    mainCircleSize={110 + audioLevel * 80}
                    mainCircleOpacity={0.18 + audioLevel * 0.4}
                    numCircles={5}
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div
                      className="flex items-center gap-2 rounded-full px-3 py-1"
                      style={{
                        background: "var(--glass-bg-strong)",
                        border: "0.5px solid var(--glass-border-outer)",
                        backdropFilter: "blur(8px)",
                        boxShadow: "inset 0 1px 0 var(--glass-border)",
                      }}
                    >
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                      </span>
                      <span
                        style={{
                          fontFamily: "'Geist Variable', sans-serif",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        Escuchando…
                      </span>
                    </div>
                    <ShortcutKbd keys={hotkeyParts} />
                    <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                      Suelta para transcribir
                    </p>
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
                    <span className="size-2 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "#d1ff3a" }} />
                    <span className="size-2 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "#d1ff3a" }} />
                    <span className="size-2 animate-bounce rounded-full" style={{ background: "#d1ff3a" }} />
                  </div>
                  <p style={{ fontFamily: "'Geist Variable', sans-serif", fontSize: "14px", fontWeight: 500, color: "var(--text-secondary)" }}>
                    Transcribiendo…
                  </p>
                </motion.div>
              )}

              {status === "result" && resultText && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.24 }}
                  className="w-full max-w-xl px-2"
                >
                  <div
                    className="relative overflow-hidden rounded-[12px] p-5"
                    style={{
                      background: "var(--glass-bg-strong)",
                      border: "0.5px solid var(--glass-border-outer)",
                      backdropFilter: "blur(12px)",
                      boxShadow: "inset 0 1px 0 var(--glass-border)",
                    }}
                  >
                    <ShineBorder
                      borderWidth={1}
                      duration={6}
                      shineColor={["#d1ff3a", "#e7ff7a", "#f0ffaa"]}
                    />
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <ModeChip mode={mode} />
                      <CopyButton text={resultText} variant="ghost" />
                    </div>
                    <TextAnimate
                      animation="blurInUp"
                      by="word"
                      duration={0.5}
                      once
                      startOnView={false}
                      style={{
                        fontFamily: "'Geist Variable', sans-serif",
                        fontSize: "15px",
                        fontWeight: 450,
                        lineHeight: 1.6,
                        color: "var(--text-primary)",
                      }}
                    >
                      {resultText}
                    </TextAnimate>
                  </div>
                </motion.div>
              )}

              {status === "error" && errorMessage && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="w-full max-w-md px-2"
                >
                  <div
                    className="rounded-[12px] p-4"
                    style={{
                      background: "rgba(220,38,38,0.08)",
                      border: "0.5px solid rgba(220,38,38,0.25)",
                    }}
                  >
                    <p style={{ fontFamily: "'Geist Variable', sans-serif", fontSize: "14px", fontWeight: 500, color: "var(--delta-red)" }}>
                      {errorMessage}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </div>

        {/* Inline history panel */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
              }}
            >
              Historial reciente
            </span>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1"
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "11.5px",
                fontWeight: 500,
                color: "var(--text-secondary)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              Ver todo
              <ChevronRight size={12} strokeWidth={2.25} />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} style={{ height: "56px" }} />
              ))}
            </div>
          ) : recentHistory.length === 0 ? (
            <GlassCard className="p-6 text-center">
              <p
                style={{
                  fontFamily: "'Geist Variable', sans-serif",
                  fontSize: "13px",
                  fontWeight: 450,
                  color: "var(--text-muted)",
                }}
              >
                Aún no hay sesiones. Mantén el atajo y empieza a hablar.
              </p>
            </GlassCard>
          ) : (
            <div className="flex flex-col gap-2">
              {recentHistory.map((item) => {
                const Icon = MODE_ICONS[MODE_ICONS_BY_NAME[item.mode_used as ModeName] ?? "Mic"] ?? MODE_ICONS.Mic;
                const color = modeColor(item.mode_used);
                const label = modeLabel(item.mode_used);
                const text = item.processed_text || item.raw_text;
                return (
                  <GlassCard key={item.id} className="group px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "8px",
                          background: `${color}14`,
                          border: `0.5px solid ${color}30`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={13} strokeWidth={2} style={{ color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-2">
                          <span
                            style={{
                              fontFamily: "'Geist Variable', sans-serif",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {label}
                          </span>
                          <span
                            style={{
                              fontFamily: "'Space Mono', monospace",
                              fontSize: "10px",
                              color: "var(--text-muted)",
                            }}
                          >
                            · {relativeTime(item.timestamp)}
                          </span>
                        </div>
                        <p
                          style={{
                            fontFamily: "'Geist Variable', sans-serif",
                            fontSize: "12.5px",
                            fontWeight: 450,
                            color: "var(--text-secondary)",
                            lineHeight: 1.5,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {text}
                        </p>
                      </div>
                      <RowCopyButton text={text} />
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="right"
          className="w-[560px] sm:max-w-[560px] p-0"
          style={{
            background: "oklch(13% 0.08 209 / 0.96)",
            border: "0.5px solid var(--glass-border)",
            backdropFilter: "blur(20px) saturate(140%)",
            WebkitBackdropFilter: "blur(20px) saturate(140%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), -8px 0 32px rgba(0,0,0,0.40)",
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Historial completo</SheetTitle>
          </SheetHeader>
          <HistoryPage embedded />
        </SheetContent>
      </Sheet>
    </div>
  );
}

