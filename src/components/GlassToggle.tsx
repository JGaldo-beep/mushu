interface GlassToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function GlassToggle({ value, onChange, disabled }: GlassToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "38px",
        height: "22px",
        borderRadius: "11px",
        background: value ? "#d1ff3a" : "rgba(255,255,255,0.10)",
        border: "0.5px solid",
        borderColor: value ? "rgba(209,255,58,0.55)" : "rgba(255,255,255,0.10)",
        boxShadow: value
          ? "inset 0 1px 0 rgba(255,255,255,0.45), 0 0 12px rgba(209,255,58,0.30)"
          : "inset 0 1px 0 rgba(255,255,255,0.05)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: "#ffffff",
          transform: `translateX(${value ? "19px" : "3px"})`,
          transition: "transform 0.2s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.40)",
        }}
      />
    </button>
  );
}
