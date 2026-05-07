import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-[10px]", className)}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "0.5px solid rgba(255,255,255,0.04)",
        ...style,
      }}
    />
  );
}
