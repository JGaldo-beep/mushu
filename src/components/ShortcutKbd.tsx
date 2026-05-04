import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Key({ children, size = "md" }: { children: ReactNode; size?: "sm" | "md" }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-background font-mono font-medium text-foreground",
        size === "md"
          ? "h-7 min-w-7 px-2 text-[12px] shadow-[inset_0_-1px_0_oklch(0_0_0/0.06)]"
          : "h-5 min-w-5 px-1.5 text-[10px]",
      )}
    >
      {children}
    </kbd>
  );
}

export function ShortcutKbd({
  keys,
  size = "md",
  className,
}: {
  keys: string[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} className="inline-flex items-center gap-1.5">
          <Key size={size}>{k}</Key>
          {i < keys.length - 1 && (
            <span className={cn("text-muted-foreground", size === "md" ? "text-xs" : "text-[10px]")}>+</span>
          )}
        </span>
      ))}
    </span>
  );
}
