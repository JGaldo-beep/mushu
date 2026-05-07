import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  variant?: "default" | "strong" | "subtle";
}

const VARIANT_BG: Record<NonNullable<GlassCardProps["variant"]>, string> = {
  default: "var(--glass-bg)",
  strong: "var(--glass-bg-strong)",
  subtle: "var(--glass-bg-subtle)",
};

export function GlassCard({
  children,
  className,
  style,
  onClick,
  variant = "default",
}: GlassCardProps) {
  return (
    <div
      className={cn("rounded-[14px]", className)}
      style={{
        background: VARIANT_BG[variant],
        border: "0.5px solid var(--glass-border-outer)",
        boxShadow:
          "inset 0 1px 0 var(--glass-border), 0 1px 2px rgba(0,0,0,0.20), 0 8px 24px rgba(0,0,0,0.30)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
