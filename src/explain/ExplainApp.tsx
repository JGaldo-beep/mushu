import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ThinkingDots } from "@/overlay/components/ThinkingDots";
import { cn } from "@/lib/utils";

async function closeExplain() {
  try {
    await invoke("close_explain_window");
  } catch {
    /* ignore */
  }
}

export function ExplainApp() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onBackdropPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      void closeExplain();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void closeExplain();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    void listen<{ loading?: boolean }>("explain_reset", (e) => {
      setText("");
      setError(null);
      const p = e.payload;
      setLoading(p?.loading !== false);
    }).then((unlisten) => {
      unsubs.push(unlisten);
    });

    void listen<{ content: string }>("explain_chunk", (e) => {
      const piece = e.payload?.content ?? "";
      if (piece) {
        setLoading(false);
        setText((t) => t + piece);
      }
    }).then((unlisten) => {
      unsubs.push(unlisten);
    });

    void listen("explain_done", () => {
      setLoading(false);
    }).then((unlisten) => {
      unsubs.push(unlisten);
    });

    void listen<string>("explain_error", (e) => {
      setLoading(false);
      const msg = e.payload;
      setError(typeof msg === "string" ? msg : "Error al explicar.");
    }).then((unlisten) => {
      unsubs.push(unlisten);
    });

    return () => {
      for (const u of unsubs) u();
    };
  }, []);

  return (
    <div
      role="presentation"
      className="flex h-full w-full cursor-default items-center justify-center bg-black/45 p-4"
      onPointerDown={onBackdropPointerDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="explain-title"
        className={cn(
          "overlay-pill-surface text-foreground relative w-full max-w-[500px] cursor-auto rounded-xl",
          "shadow-[var(--overlay-pill-shadow)]",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <h2 id="explain-title" className="text-sm font-medium tracking-tight text-foreground/90">
            Explicar selección
          </h2>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Cerrar"
            onClick={() => void closeExplain()}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[400px] min-h-[120px] overflow-y-auto px-3 py-3">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading && !text ? (
            <div className="flex min-h-[100px] items-center justify-center py-6">
              <ThinkingDots />
            </div>
          ) : (
            <p className="select-text whitespace-pre-wrap text-sm leading-relaxed text-foreground/95">
              {text}
            </p>
          )}
        </div>
        {loading && text ? (
          <div className="flex justify-end border-t border-border/40 px-3 py-2">
            <ThinkingDots />
          </div>
        ) : null}
      </div>
    </div>
  );
}
