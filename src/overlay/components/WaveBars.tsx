import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/// Live scrolling waveform. Cada `SHIFT_INTERVAL_MS` ms, el buffer interno se desplaza una
/// posición a la izquierda y un nuevo sample (el `level` actual) entra por la derecha. Las
/// barras antiguas (izquierda) se desvanecen para dar sensación de "scrolling" en tiempo real.
const BAR_COUNT = 22;
const BAR_WIDTH = 2;
const BAR_GAP = 2;
const MIN_H = 3;
const MAX_H = 28;
const SHIFT_INTERVAL_MS = 55;
const LERP = 0.4;

export function WaveBars({
  level,
  color,
  idle,
  className,
}: {
  level: number;
  color: string;
  idle: boolean;
  className?: string;
}) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buffer = useRef<number[]>(Array.from({ length: BAR_COUNT }, () => 0));
  const renderedHeights = useRef<number[]>(
    Array.from({ length: BAR_COUNT }, () => MIN_H),
  );
  const levelRef = useRef(level);
  levelRef.current = level;
  const idleRef = useRef(idle);
  idleRef.current = idle;
  const lastShift = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      // 1) Cada SHIFT_INTERVAL_MS, desplazamos el buffer a la izquierda y agregamos el
      //    sample actual a la derecha.
      if (now - lastShift.current >= SHIFT_INTERVAL_MS) {
        lastShift.current = now;
        const buf = buffer.current;
        for (let i = 0; i < BAR_COUNT - 1; i++) {
          buf[i] = buf[i + 1];
        }
        const lv = levelRef.current;
        // Pequeño jitter orgánico para que sample-rate idéntico no se vea "robótico".
        const jitter = (Math.sin(now / 110) + Math.sin(now / 67)) * 0.04 * lv;
        buf[BAR_COUNT - 1] = Math.max(0, Math.min(1, lv + jitter));
      }

      // 2) Calculamos altura objetivo. En idle generamos un sine wave suave que respira
      //    en lugar de mostrar todas las barras planas.
      const targets = new Array<number>(BAR_COUNT);
      if (idleRef.current) {
        for (let i = 0; i < BAR_COUNT; i++) {
          const phase = now / 720 + i * 0.32;
          const breath = (Math.sin(phase) + 1) * 0.5; // 0..1
          targets[i] = MIN_H + breath * 5;
        }
      } else {
        for (let i = 0; i < BAR_COUNT; i++) {
          targets[i] = MIN_H + buffer.current[i] * (MAX_H - MIN_H);
        }
      }

      // 3) Suavizamos la transición visual con LERP.
      for (let i = 0; i < BAR_COUNT; i++) {
        renderedHeights.current[i] +=
          (targets[i] - renderedHeights.current[i]) * LERP;
        const el = barRefs.current[i];
        if (el) {
          el.style.height = `${renderedHeights.current[i]}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn("flex h-8 items-center justify-end", className)}
      style={{ gap: `${BAR_GAP}px` }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        // Las barras más viejas (izquierda) se desvanecen para crear la sensación de scroll.
        const age = (BAR_COUNT - 1 - i) / (BAR_COUNT - 1); // 0 = nueva, 1 = más vieja
        const opacity = idle ? 0.22 + (1 - age) * 0.18 : 1 - age * 0.62;
        return (
          <div
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="rounded-full will-change-[height]"
            style={{
              width: `${BAR_WIDTH}px`,
              height: MIN_H,
              backgroundColor: color,
              opacity,
              boxShadow: idle ? "none" : `0 0 4px ${color}55`,
              transition: "opacity 200ms cubic-bezier(0.33, 1, 0.68, 1)",
            }}
          />
        );
      })}
    </div>
  );
}
