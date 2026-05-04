import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

const LERP = 0.25;
const LEVEL_GAIN = 12;

/**
 * Nivel de audio suavizado (requestAnimationFrame) para el overlay.
 * Misma fuente que la app principal (`audio_level`), con ganancia ×12 como el overlay legacy.
 */
export function useAudioLevel(active: boolean) {
  const targetRef = useRef(0);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const unlisten = listen<number>("audio_level", (event) => {
      const v = typeof event.payload === "number" ? event.payload : 0;
      targetRef.current = Math.min(1, Math.max(0, v * LEVEL_GAIN));
    });

    let raf = 0;
    const tick = () => {
      setLevel((cur) => {
        const t = active ? targetRef.current : 0;
        return cur + (t - cur) * LERP;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      void unlisten.then((f) => f());
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      targetRef.current = 0;
    }
  }, [active]);

  return level;
}
