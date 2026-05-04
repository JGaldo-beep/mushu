import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MODE, normalizeMode } from "@/lib/modes";
import { tauri } from "@/lib/tauri";
import type { ModeInfo, ModeName } from "@/lib/types";

export type DictationStatus = "idle" | "recording" | "processing" | "result" | "error";

interface DictationState {
  status: DictationStatus;
  resultText: string | null;
  errorMessage: string | null;
  mode: ModeInfo;
  hotkey: string;
  modeHotkey: string;
}

const RESULT_AUTO_CLEAR_MS = 12000;
const ERROR_AUTO_CLEAR_MS = 6000;

type ModePayload = Partial<ModeInfo> & { name?: ModeName };

export function useDictation() {
  const [state, setState] = useState<DictationState>({
    status: "idle",
    resultText: null,
    errorMessage: null,
    mode: DEFAULT_MODE,
    hotkey: "Ctrl+Space",
    modeHotkey: "Ctrl+Shift+M",
  });

  const clearTimerRef = useRef<number | null>(null);

  const scheduleClear = useCallback((ms: number) => {
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => {
      setState((s) => ({ ...s, status: "idle", resultText: null, errorMessage: null }));
      clearTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    tauri
      .getFrontendState()
      .then((fs) => {
        setState((s) => ({
          ...s,
          mode: normalizeMode(fs.mode),
          hotkey: fs.hotkey,
          modeHotkey: fs.mode_hotkey,
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unlistenStart = listen("recording_started", (event) => {
      const m = event.payload as ModePayload | null;
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setState((s) => ({
        ...s,
        status: "recording",
        resultText: null,
        errorMessage: null,
        mode: m?.name ? normalizeMode(m as ModeInfo) : s.mode,
      }));
    });

    const unlistenProcessing = listen("dictation_processing", (event) => {
      const active = (event.payload as { active?: boolean })?.active === true;
      if (active) setState((s) => ({ ...s, status: "processing" }));
    });

    const unlistenDone = listen("transcription_done", (event) => {
      const p = event.payload as { text?: string; mode?: ModeInfo };
      const hasText = !!p?.text;
      setState((s) => ({
        ...s,
        status: hasText ? "result" : "idle",
        resultText: p?.text ?? null,
        mode: p?.mode?.name ? normalizeMode(p.mode) : s.mode,
      }));
      if (hasText) scheduleClear(RESULT_AUTO_CLEAR_MS);
    });

    const unlistenMushu = listen("mushu_reply", (event) => {
      const p = event.payload as { text?: string };
      const hasText = !!p?.text;
      setState((s) => ({
        ...s,
        status: hasText ? "result" : "idle",
        resultText: p?.text ?? null,
      }));
      if (hasText) scheduleClear(RESULT_AUTO_CLEAR_MS);
    });

    const unlistenModeChanged = listen("mode_changed", (event) => {
      const m = event.payload as ModePayload;
      if (!m?.name) return;
      setState((s) => ({ ...s, mode: normalizeMode(m as ModeInfo) }));
    });

    const unlistenModeSwitch = listen("mode_switch_ok", (event) => {
      const m = event.payload as ModePayload;
      if (!m?.name) return;
      setState((s) => ({ ...s, mode: normalizeMode(m as ModeInfo) }));
    });

    const unlistenError = listen("transcription_error", (event) => {
      const msg = String(event.payload ?? "Error de transcripción.");
      setState((s) => ({ ...s, status: "error", errorMessage: msg }));
      scheduleClear(ERROR_AUTO_CLEAR_MS);
    });

    const unlistenGroq = listen("groq_error", (event) => {
      const msg = String(event.payload ?? "Groq no disponible.");
      setState((s) => ({ ...s, status: "error", errorMessage: `Groq: ${msg}` }));
      scheduleClear(ERROR_AUTO_CLEAR_MS);
    });

    return () => {
      unlistenStart.then((f) => f());
      unlistenProcessing.then((f) => f());
      unlistenDone.then((f) => f());
      unlistenMushu.then((f) => f());
      unlistenModeChanged.then((f) => f());
      unlistenModeSwitch.then((f) => f());
      unlistenError.then((f) => f());
      unlistenGroq.then((f) => f());
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    };
  }, [scheduleClear]);

  const setMode = useCallback(async (name: ModeName) => {
    const optimistic = normalizeMode({ name });
    setState((s) => ({ ...s, mode: optimistic }));
    try {
      await tauri.setMode(name);
    } catch (err) {
      try {
        const fs = await tauri.getFrontendState();
        setState((s) => ({ ...s, mode: normalizeMode(fs.mode) }));
      } catch {
        /* ignore */
      }
      throw err;
    }
  }, []);

  const dismiss = useCallback(() => {
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    setState((s) => ({ ...s, status: "idle", resultText: null, errorMessage: null }));
  }, []);

  return {
    ...state,
    setMode,
    dismiss,
  };
}
