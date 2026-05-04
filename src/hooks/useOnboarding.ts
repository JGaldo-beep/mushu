import { useCallback, useEffect, useState } from "react";
import { tauri } from "@/lib/tauri";

type OnboardingSnapshot = {
  hotkey: string;
  mode_hotkey: string;
  has_groq_key: boolean;
};

export function useOnboarding() {
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fs = await tauri.getFrontendState();
      setSnapshot({
        hotkey: fs.hotkey,
        mode_hotkey: fs.mode_hotkey,
        has_groq_key: fs.has_groq_key,
      });
      setOpen(!fs.onboarding_completed);
    } catch {
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const complete = useCallback(async () => {
    await tauri.completeOnboarding();
    setOpen(false);
  }, []);

  return { loading, open, snapshot, complete, refresh };
}
