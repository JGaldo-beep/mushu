import { History as HistoryIcon, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHistory } from "@/hooks/useHistory";
import { MODE_COLORS, MODE_ICONS, MODE_ICONS_BY_NAME, MODE_LABELS } from "@/lib/modes";
import type { HistoryItem, ModeName } from "@/lib/types";

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
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function HistoryPage() {
  const { items, loading, clear } = useHistory();
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.processed_text.toLowerCase().includes(q) ||
        i.raw_text.toLowerCase().includes(q) ||
        (MODE_LABELS[i.mode_used as ModeName] ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-background/40 px-6 py-5 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Historial</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tus últimas transcripciones, guardadas en este equipo.
              </p>
            </div>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                  disabled={!items.length}
                >
                  <Trash2 className="size-3.5" />
                  Borrar todo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Borrar el historial?</DialogTitle>
                  <DialogDescription>
                    Esta acción elimina todas las transcripciones guardadas. No se puede deshacer.
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

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el historial…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-5">
          {loading && (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Cargando…
            </div>
          )}
          {!loading && items.length === 0 && <EmptyState />}
          {!loading && items.length > 0 && filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">No hay coincidencias.</p>
          )}
          {!loading && filtered.length > 0 && (
            <ul className="flex flex-col gap-2">
              {filtered.map((item) => (
                <li key={item.id}>
                  <HistoryRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const modeName = item.mode_used as ModeName;
  const Icon = MODE_ICONS[MODE_ICONS_BY_NAME[modeName]] ?? MODE_ICONS.Mic;
  const color = MODE_COLORS[modeName] ?? "#7C3AED";
  const label = MODE_LABELS[modeName] ?? item.mode_used;
  return (
    <Card className="group relative p-4 transition-shadow hover:shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
            style={{ borderColor: `${color}55`, color }}
          >
            <Icon className="size-3" strokeWidth={2.25} />
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground">{formatTimestamp(item.timestamp)}</span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{formatDuration(item.duration_ms)}</span>
        </div>
        <CopyButton
          text={item.processed_text}
          variant="ghost"
          size="sm"
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-foreground">{item.processed_text}</p>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-background/60">
        <HistoryIcon className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-medium">Aún no hay transcripciones</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pulsa el atajo y dicta. Tus transcripciones aparecerán aquí.
        </p>
      </div>
    </div>
  );
}
