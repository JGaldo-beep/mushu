import { MODE_COLORS, MODE_ICONS, MODE_ICONS_BY_NAME, MODE_LABELS, MODE_NAMES } from "@/lib/modes";
import type { ModeName } from "@/lib/types";

export function ModeSelector({
  active,
  onChange,
  disabled,
}: {
  active: ModeName;
  onChange: (next: ModeName) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: "none" }}
      role="radiogroup"
      aria-label="Modos"
    >
      {MODE_NAMES.map((name) => {
        const Icon = MODE_ICONS[MODE_ICONS_BY_NAME[name]];
        const isActive = active === name;
        const color = MODE_COLORS[name];
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(name)}
            title={MODE_LABELS[name]}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "5px",
              padding: "9px 14px",
              borderRadius: "10px",
              border: isActive
                ? `0.5px solid ${color}50`
                : "0.5px solid var(--glass-border-outer)",
              background: isActive ? `${color}14` : "var(--glass-bg-subtle)",
              boxShadow: isActive
                ? "inset 0 1px 0 rgba(255,255,255,0.6)"
                : "inset 0 1px 0 rgba(255,255,255,0.5)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
              flexShrink: 0,
              transition: "background 0.15s, border-color 0.15s",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <Icon
              style={{
                width: "16px",
                height: "16px",
                color: isActive ? color : "var(--text-secondary)",
              }}
              strokeWidth={isActive ? 2.25 : 2}
            />
            <span
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "11px",
                fontWeight: isActive ? 600 : 500,
                color: isActive ? color : "var(--text-secondary)",
                whiteSpace: "nowrap",
                letterSpacing: "-0.005em",
              }}
            >
              {MODE_LABELS[name]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
