import { cn } from "@/lib/utils";

export function ThinkingDots({ className }: { className?: string }) {
  return (
    <div
      className={cn("inline-flex items-center justify-center gap-1.5", className)}
      role="status"
      aria-label="Procesando"
    >
      <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-primary" />
    </div>
  );
}
