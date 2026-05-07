import { ChevronsUpDown, CreditCard, LogOut, Sparkles, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import type { NavSection } from "@/lib/types";

interface NavUserProps {
  onNavigate: (next: NavSection) => void;
}

export function NavUser({ onNavigate }: NavUserProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-accent"
          tooltip="Cuenta"
          style={{ color: "var(--text-secondary)" }}
        >
          <span
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "rgba(209,255,58,0.14)",
              border: "0.5px solid rgba(209,255,58,0.42)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <User style={{ width: "14px", height: "14px", color: "#d1ff3a" }} strokeWidth={2.25} />
          </span>
          <span
            className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden"
            style={{ minWidth: 0 }}
          >
            <span
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "12.5px",
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Mushu User
            </span>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "9px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Free · α
            </span>
          </span>
          <ChevronsUpDown
            className="ml-auto group-data-[collapsible=icon]:hidden"
            style={{ width: "13px", height: "13px", color: "var(--text-muted)" }}
            strokeWidth={2}
          />
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-56 p-1.5"
        style={{
          background: "oklch(15% 0.08 209 / 0.96)",
          border: "0.5px solid var(--glass-border)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          boxShadow:
            "inset 0 1px 0 var(--glass-border), 0 8px 24px rgba(0,0,0,0.40)",
        }}
      >
        <div style={{ padding: "8px 10px 6px" }}>
          <div
            style={{
              fontFamily: "'Geist Variable', sans-serif",
              fontSize: "12.5px",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Mushu User
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "9px",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: "2px",
            }}
          >
            Free plan
          </div>
        </div>

        <div style={{ height: "0.5px", background: "var(--glass-border-outer)", margin: "4px 0" }} />

        <MenuItem
          icon={Sparkles}
          label="Upgrade to Pro"
          onClick={() => onNavigate("account")}
        />
        <MenuItem
          icon={CreditCard}
          label="Billing"
          onClick={() => onNavigate("account")}
          disabled
        />

        <div style={{ height: "0.5px", background: "var(--glass-border-outer)", margin: "4px 0" }} />

        <MenuItem
          icon={LogOut}
          label="Sign out"
          onClick={() => undefined}
          disabled
        />
      </PopoverContent>
    </Popover>
  );
}

interface MenuItemProps {
  icon: typeof User;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ icon: Icon, label, onClick, disabled }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "7px 10px",
        background: "transparent",
        border: "none",
        borderRadius: "6px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Geist Variable', sans-serif",
        fontSize: "12.5px",
        fontWeight: 500,
        color: "var(--text-primary)",
        textAlign: "left",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon style={{ width: "14px", height: "14px", color: "var(--text-secondary)" }} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}
