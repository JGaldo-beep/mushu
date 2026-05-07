import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mushu.ai_features.v1";

export interface AIFeaturesState {
  formattingEnabled: boolean;
  agentEnabled: boolean;
  autoTranslateEnabled: boolean;
  autoTranslateTarget: string;
}

const DEFAULT_STATE: AIFeaturesState = {
  formattingEnabled: true,
  agentEnabled: false,
  autoTranslateEnabled: false,
  autoTranslateTarget: "en",
};

function readStored(): AIFeaturesState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

/**
 * Persists AI feature toggles in localStorage. Backend integration is intentionally
 * deferred — the values are not wired to the transcription pipeline yet.
 */
export function useAIFeatures() {
  const [state, setState] = useState<AIFeaturesState>(() => readStored());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota errors */
    }
  }, [state]);

  const setField = useCallback(
    <K extends keyof AIFeaturesState>(key: K, value: AIFeaturesState[K]) => {
      setState((s) => ({ ...s, [key]: value }));
    },
    [],
  );

  return { ...state, setField };
}
