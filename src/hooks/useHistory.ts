import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { tauri } from "@/lib/tauri";
import type { HistoryItem } from "@/lib/types";

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const rows = await tauri.getHistory();
      setItems(rows);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("transcription_done", () => {
      void refresh();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [refresh]);

  const clear = useCallback(async () => {
    await tauri.clearHistory();
    setItems([]);
  }, []);

  return { items, loading, refresh, clear };
}
