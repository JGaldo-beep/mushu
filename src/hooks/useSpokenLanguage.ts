import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mushu.spoken_language.v1";
const DEFAULT_VALUE = "auto";

/**
 * Persists the user's preferred spoken language in localStorage.
 * Backend integration (passing it to Whisper) is a follow-up.
 */
export function useSpokenLanguage() {
  const [language, setLanguageState] = useState<string>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_VALUE;
    } catch {
      return DEFAULT_VALUE;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore */
    }
  }, [language]);

  const setLanguage = useCallback((next: string) => {
    setLanguageState(next);
  }, []);

  return { language, setLanguage };
}
