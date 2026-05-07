import { GlassCard } from "@/components/GlassCard";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  className?: string;
}

export function MetricCard({ label, value, unit, delta, className }: MetricCardProps) {
  const hasDelta = delta !== undefined && delta !== null && !Number.isNaN(delta);
  const isPositive = hasDelta && delta! > 0;
  const isNegative = hasDelta && delta! < 0;

  return (
    <GlassCard
      className={cn("flex flex-col gap-1.5", className)}
      style={{ padding: "14px 16px" }}
    >
      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "9.5px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className="tabular"
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "24px",
            fontWeight: 700,
            lineHeight: 1,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: "'Geist Variable', sans-serif",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--text-secondary)",
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {hasDelta && (
        <span
          className="tabular"
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "10px",
            color: isPositive
              ? "var(--delta-green)"
              : isNegative
                ? "var(--delta-red)"
                : "var(--text-muted)",
          }}
        >
          {isPositive ? "+" : ""}
          {delta}
          {unit ? " " + unit : ""}
        </span>
      )}
    </GlassCard>
  );
}
