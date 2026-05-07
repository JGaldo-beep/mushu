import { AnimatePresence, motion } from "framer-motion";
import { Pause, Pin } from "lucide-react";
import { ModeBadge } from "@/overlay/components/ModeBadge";
import { MushuReplyCard } from "@/overlay/components/MushuReplyCard";
import { ThinkingDots } from "@/overlay/components/ThinkingDots";
import { WaveBars } from "@/overlay/components/WaveBars";
import { useAudioLevel } from "@/overlay/useAudioLevel";
import { useOverlayState } from "@/overlay/useOverlayState";
import { cn } from "@/lib/utils";

const ease = [0.33, 1, 0.68, 1] as const;
const transition = { duration: 0.22, ease } as const;

export function Overlay() {
  const {
    surface,
    mode,
    modeBannerOnly,
    mushuReplyText,
    modePopToken,
    isProcessing,
    isReply,
    showPill,
    showThinking,
    transcriptionFadeOut,
    audioLevelActive,
    isHandsOff,
    isPaused,
  } = useOverlayState();

  const audioLevel = useAudioLevel(audioLevelActive);
  const waveIdle = audioLevel < 0.04;

  return (
    <div className="flex h-full w-full items-center justify-center p-1">
      <AnimatePresence mode="wait">
        {showPill && (
          <motion.div
            key="pill-shell"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: transcriptionFadeOut ? 0 : 1,
              scale: transcriptionFadeOut ? 0.96 : 1,
            }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={transition}
            className={cn(
              "overlay-pill-surface text-foreground",
              isReply ? "w-full max-w-[min(100%,408px)]" : "w-fit max-w-full min-w-0",
              !isReply && "overlay-route-dict",
            )}
          >
            <AnimatePresence mode="wait">
              {isReply && mushuReplyText !== null ? (
                <motion.div
                  key="reply"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={transition}
                >
                  <MushuReplyCard text={mushuReplyText} />
                </motion.div>
              ) : (
                <motion.div
                  key="main-surface"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={transition}
                  className={cn(
                    "flex min-h-0 items-center gap-2 px-2.5 py-1",
                    modeBannerOnly || isProcessing ? "justify-center" : "justify-between",
                  )}
                >
                  {!isProcessing && (
                    <ModeBadge mode={mode} className="max-w-[min(100%,280px)]" key={modePopToken} />
                  )}
                  {!modeBannerOnly && (
                    <div
                      className={cn(
                        "flex min-h-8 shrink-0 items-center gap-1.5",
                        isProcessing ? "min-w-[52px] justify-center" : "min-w-[100px] justify-end",
                      )}
                    >
                      {isProcessing ? (
                        showThinking ? (
                          <ThinkingDots />
                        ) : (
                          <span className="inline-block min-h-4 min-w-10" aria-hidden />
                        )
                      ) : isPaused ? (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.7 }}
                          transition={transition}
                          title="Pausado — toca el atajo de pausa para reanudar"
                          style={{
                            color: mode.color,
                            lineHeight: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 32,
                          }}
                        >
                          <Pause size={14} strokeWidth={2.5} />
                        </motion.span>
                      ) : (
                        <>
                          {isHandsOff && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.7 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.7 }}
                              transition={transition}
                              title="Hands-off activo — toca el atajo para detener"
                              style={{ color: mode.color, lineHeight: 0 }}
                            >
                              <Pin size={12} strokeWidth={2.5} />
                            </motion.span>
                          )}
                          <WaveBars level={audioLevel} color={mode.color} idle={waveIdle} />
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
