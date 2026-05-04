import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 5;
const LERP = 0.25;
const MIN_H = 4;
const MAX_H = 32;

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
  const heightsRef = useRef<number[]>(Array.from({ length: BAR_COUNT }, () => MIN_H));
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    const heights = heightsRef.current;
    let raf = 0;
    const tick = (now: number) => {
      const lv = levelRef.current;
      for (let i = 0; i < BAR_COUNT; i++) {
        const wobble = Math.sin(now / 180 + i * 0.45) * 0.5 + 0.5;
        const responsive = lv * (0.45 + 0.55 * wobble);
        const targetH = MIN_H + responsive * (MAX_H - MIN_H);
        heights[i] += (targetH - heights[i]) * LERP;
        const el = barRefs.current[i];
        if (el) el.style.height = `${heights[i]}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={cn("flex h-8 items-center justify-end", className)} style={{ gap: "4px" }}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className={cn(
            "w-[3px] rounded-full will-change-[height]",
            idle ? "opacity-[0.35]" : "opacity-100",
          )}
          style={{
            height: MIN_H,
            backgroundColor: color,
            transition: "opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)",
          }}
        />
      ))}
    </div>
  );
}
