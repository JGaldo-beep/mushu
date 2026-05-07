import { CreditCard, LogOut, Sparkles, User } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AccountPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="mushu-topbar flex items-center justify-between px-5 py-3"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-3">
          <SidebarTrigger style={{ color: "var(--text-secondary)" }} />
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
              Cuenta
            </p>
            <p
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "12px",
                fontWeight: 450,
                color: "var(--text-muted)",
              }}
            >
              Tu plan y sesión
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <GlassCard className="p-5">
            <div className="flex items-center gap-4">
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: "rgba(209,255,58,0.14)",
                  border: "0.5px solid rgba(209,255,58,0.42)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <User size={22} strokeWidth={2} style={{ color: "#d1ff3a" }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  style={{
                    fontFamily: "'Geist Variable', sans-serif",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Mushu User
                </h3>
                <p
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginTop: "2px",
                  }}
                >
                  Plan Free · Versión α
                </p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="mb-4 flex items-start gap-3">
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "rgba(209,255,58,0.14)",
                  border: "0.5px solid rgba(209,255,58,0.38)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Sparkles size={18} strokeWidth={2} style={{ color: "#d1ff3a" }} />
              </div>
              <div>
                <h3
                  style={{
                    fontFamily: "'Geist Variable', sans-serif",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  Upgrade to Pro
                </h3>
                <p
                  style={{
                    fontFamily: "'Geist Variable', sans-serif",
                    fontSize: "12.5px",
                    fontWeight: 450,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    marginTop: "4px",
                  }}
                >
                  Modos custom, transcripción ilimitada, soporte prioritario. Próximamente.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="glass-btn w-full rounded-lg py-2.5"
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                opacity: 0.55,
                cursor: "not-allowed",
              }}
            >
              Disponible próximamente
            </button>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CreditCard size={18} strokeWidth={2} style={{ color: "var(--text-secondary)" }} />
                <div>
                  <h3
                    style={{
                      fontFamily: "'Geist Variable', sans-serif",
                      fontSize: "13.5px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    Facturación
                  </h3>
                  <p
                    style={{
                      fontFamily: "'Geist Variable', sans-serif",
                      fontSize: "12px",
                      fontWeight: 450,
                      color: "var(--text-muted)",
                    }}
                  >
                    Sin método de pago configurado.
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-2 py-1"
              style={{
                fontFamily: "'Geist Variable', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--delta-red)",
                background: "transparent",
                border: "none",
                cursor: "not-allowed",
                opacity: 0.55,
              }}
            >
              <LogOut size={15} strokeWidth={2} />
              Cerrar sesión
            </button>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
