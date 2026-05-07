import React from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const BTN_BASE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "46px",
  height: "32px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "rgba(243,231,201,0.45)",
  transition: "background 0.12s, color 0.12s",
  flexShrink: 0,
};

function WinBtn({
  onClick,
  hoverBg,
  children,
}: {
  onClick: () => void;
  hoverBg: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      style={BTN_BASE}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
        e.currentTarget.style.color = "#f3e7c9";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "rgba(243,231,201,0.45)";
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const win = getCurrentWindow();

  return (
    <div style={{ height: "32px", flexShrink: 0, display: "flex" }}>
      {/*
        Drag region covers only the left/center area.
        -webkit-app-region:drag eats ALL pointer events within its box,
        so buttons must be siblings outside this element, not children.
      */}
      <div
        data-tauri-drag-region
        style={{ flex: 1, cursor: "default" }}
      />

      {/* Buttons are siblings of the drag region — pointer events work normally */}
      <WinBtn hoverBg="rgba(255,255,255,0.08)" onClick={() => win.minimize()}>
        <Minus size={12} strokeWidth={2} />
      </WinBtn>
      <WinBtn hoverBg="rgba(255,255,255,0.08)" onClick={() => win.toggleMaximize()}>
        <Square size={10} strokeWidth={2} />
      </WinBtn>
      <WinBtn hoverBg="rgba(196,50,28,0.85)" onClick={() => win.close()}>
        <X size={13} strokeWidth={2} />
      </WinBtn>
    </div>
  );
}
