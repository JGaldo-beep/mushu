import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

export function useAudioLevel(active: boolean) {
  const [level, setLevel] = useState(0);
  const targetRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      targetRef.current = 0;
      return;
    }

    const unlisten = listen("audio_level", (event) => {
      const v = typeof event.payload === "number" ? event.payload : 0;
      targetRef.current = Math.min(1, Math.max(0, v));
    });

    let raf = 0;
    const tick = () => {
      setLevel((cur) => cur + (targetRef.current - cur) * 0.22);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      unlisten.then((f) => f());
    };
  }, [active]);

  return level;
}
