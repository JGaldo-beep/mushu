import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { tauri } from "@/lib/tauri";
import type { FrontendState, SaveSettingsInput } from "@/lib/types";

export function useSettings() {
  const [state, setState] = useState<FrontendState | null>(null);
  const [draft, setDraft] = useState<FrontendState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fs = await tauri.getFrontendState();
      setState(fs);
      setDraft(fs);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("frontend_state_changed", () => {
      void load();
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      unlisten?.();
    };
  }, [load]);

  const setField = useCallback(
    <K extends keyof FrontendState>(key: K, value: FrontendState[K]) => {
      setDraft((d) => (d ? { ...d, [key]: value } : d));
    },
    [],
  );

  const isDirty =
    !!state && !!draft && JSON.stringify(state) !== JSON.stringify(draft);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      // Re-fetch theme right before saving so a sidebar theme change isn't overwritten.
      const fresh = await tauri.getFrontendState();
      const input: SaveSettingsInput = {
        hotkey: draft.hotkey,
        mode_hotkey: draft.mode_hotkey,
        pause_hotkey: draft.pause_hotkey,
        model: draft.model,
        processing_mode: draft.processing_mode,
        transcription_provider: draft.transcription_provider,
        microphone: draft.selected_microphone,
        theme: fresh.theme,
        sound_effects_enabled: draft.sound_effects_enabled,
        sound_effects_volume: draft.sound_effects_volume,
      };
      const updated = await tauri.saveSettings(input);
      setState(updated);
      setDraft(updated);
      return updated;
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const reset = useCallback(() => {
    if (state) setDraft(state);
  }, [state]);

  return {
    state,
    draft,
    isDirty,
    loading,
    saving,
    error,
    setField,
    save,
    reset,
    refresh: load,
  };
}
