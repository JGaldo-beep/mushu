import { History as HistoryIcon, Search, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useHistoryContext } from "@/context/HistoryContext";
import {
  MODE_ICONS,
  MODE_ICONS_BY_NAME,
  modeColor,
  modeLabel,
} from "@/lib/modes";
import type { HistoryItem, ModeName } from "@/lib/types";

interface HistoryPageProps {
  /** When true, render inside a Sheet (no SidebarTrigger, no global topbar). */
  embedded?: boolean;
}

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function groupByDate(items: HistoryItem[]) {
  const groups: { label: string; items: HistoryItem[] }[] = [];
  const map = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const d = new Date(item.timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    let key: string;
    if (d.toDateString() === today.toDateString()) {
      key = `Hoy — ${d.toLocaleDateString("es-ES", { day: "2-digit", month: "long" })}`;
    } else if (d.toDateString() === yesterday.toDateString()) {
      key = `Ayer — ${d.toLocaleDateString("es-ES", { day: "2-digit", month: "long" })}`;
    } else {
      key = d.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" });
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  for (const [label, items] of map) {
    groups.push({ label, items });
  }
  return groups;
}

export function HistoryPage({ embedded = false }: HistoryPageProps = {}) {
  const { items, loading, clear } = useHistoryContext();
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.processed_text.toLowerCase().includes(q) ||
        i.raw_text.toLowerCase().includes(q) ||
        modeLabel(i.mode_used).toLowerCase().includes(q),
    );
  }, [items, query]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Topbar */}
      <div
        className={
          embedded
            ? "flex items-center justify-between gap-4 px-5 py-4"
            : "mushu-topbar flex items-center justify-between gap-4 px-5 py-3"
        }
        style={{
          flexShrink: 0,
          borderBottom: embedded ? "0.5px solid var(--glass-border-outer)" : undefined,
        }}
      >
        <div className="flex items-center gap-3">
          {!embedded && <SidebarTrigger style={{ color: "var(--text-secondary)" }} />}
          <div>
            <p
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              Historial
            </p>
            <p
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "12px",
                fontWeight: 450,
                color: "var(--text-muted)",
              }}
            >
              Tus últimas transcripciones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "14px",
                height: "14px",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="glass-input rounded-lg"
              style={{
                paddingLeft: "32px",
                paddingRight: "12px",
                paddingTop: "7px",
                paddingBottom: "7px",
                width: "180px",
                fontSize: "13px",
                fontFamily: "'Geist Variable', sans-serif",
                fontWeight: 450,
                outline: "none",
              }}
            />
          </div>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="glass-btn rounded-lg p-2"
                disabled={!items.length}
                style={{ opacity: !items.length ? 0.4 : 1 }}
                title="Borrar todo el historial"
              >
                <Trash2 style={{ width: "15px", height: "15px" }} strokeWidth={1.85} />
              </button>
            </DialogTrigger>
            <DialogContent
              style={{
                background: "oklch(15% 0.08 209 / 0.96)",
                border: "0.5px solid var(--glass-border)",
                backdropFilter: "blur(20px) saturate(140%)",
                color: "var(--text-primary)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.50)",
              }}
            >
              <DialogHeader>
                <DialogTitle style={{ color: "var(--text-primary)" }}>
                  ¿Borrar el historial?
                </DialogTitle>
                <DialogDescription style={{ color: "var(--text-secondary)" }}>
                  Esta acción elimina todas las transcripciones. No se puede deshacer.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await clear();
                    setConfirmOpen(false);
                  }}
                >
                  Borrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-4">
          {loading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} style={{ height: "72px" }} />
              ))}
            </div>
          )}
          {!loading && items.length === 0 && <EmptyState />}
          {!loading && items.length > 0 && filtered.length === 0 && (
            <p
              className="py-12 text-center"
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "14px",
                fontWeight: 450,
                color: "var(--text-muted)",
              }}
            >
              No hay coincidencias.
            </p>
          )}
          {!loading && groups.length > 0 && (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <div key={group.label}>
                  <div
                    className="mb-3 pb-2"
                    style={{ borderBottom: "0.5px solid var(--glass-border-outer)" }}
                  >
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "var(--text-muted)",
                      }}
                    >
                      {group.label}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <HistoryRow item={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const Icon =
    MODE_ICONS[MODE_ICONS_BY_NAME[item.mode_used as ModeName] ?? "Mic"] ?? MODE_ICONS.Mic;
  const color = modeColor(item.mode_used);
  const label = modeLabel(item.mode_used);
  const words = item.processed_text.split(/\s+/).filter(Boolean).length;

  return (
    <GlassCard className="group p-4 transition-all" style={{ cursor: "default" }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              background: `${color}14`,
              border: `0.5px solid ${color}40`,
              color,
              fontSize: "10.5px",
              fontFamily: "'Geist Variable', sans-serif",
              fontWeight: 600,
            }}
          >
            <Icon className="size-3" strokeWidth={2.25} />
            {label}
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "var(--text-muted)" }}>
            {formatTimestamp(item.timestamp)}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>·</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "var(--text-muted)" }}>
            {formatDuration(item.duration_ms)}
          </span>
        </div>
        <CopyButton
          text={item.processed_text}
          variant="ghost"
          size="sm"
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>

      <p
        className="line-clamp-2"
        style={{
          fontFamily: "'Geist Variable', sans-serif",
          fontSize: "13px",
          fontWeight: 450,
          lineHeight: 1.5,
          color: "var(--text-primary)",
          marginBottom: "8px",
        }}
      >
        {item.processed_text}
      </p>

      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "var(--text-muted)" }}>
          {words} palabras
        </span>
      </div>
    </GlassCard>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div
        className="flex items-center justify-center"
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "var(--glass-bg-subtle)",
          border: "0.5px dashed var(--glass-border-outer)",
        }}
      >
        <HistoryIcon style={{ width: "20px", height: "20px", color: "var(--text-muted)" }} strokeWidth={1.85} />
      </div>
      <div>
        <p style={{ fontFamily: "'Geist Variable', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)" }}>
          Aún no hay transcripciones
        </p>
        <p style={{ fontFamily: "'Geist Variable', sans-serif", fontSize: "12px", fontWeight: 450, color: "var(--text-muted)", marginTop: "4px" }}>
          Pulsa el atajo y dicta. Tus transcripciones aparecerán aquí.
        </p>
      </div>
    </div>
  );
}
