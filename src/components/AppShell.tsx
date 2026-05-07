import { type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/TitleBar";
import type { NavSection } from "@/lib/types";

interface AppShellProps {
  children: ReactNode;
  section: NavSection;
  onSectionChange: (next: NavSection) => void;
}

export function AppShell({ children, section, onSectionChange }: AppShellProps) {
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Layer 0: deep teal abyss gradient base */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse at 50% -10%, oklch(22% 0.08 209) 0%, oklch(15% 0.08 209) 55%, oklch(10% 0.08 209) 100%)",
        }}
      />

      {/* Layer 1: signature lime glow top-right */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background:
            "radial-gradient(circle at 92% -10%, oklch(92% 0.2653 125 / 0.10) 0%, oklch(92% 0.2653 125 / 0.04) 30%, transparent 55%)",
        }}
      />

      {/* Layer 2: cool teal tint bottom-left for depth */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background:
            "radial-gradient(circle at 5% 110%, oklch(40% 0.08 209 / 0.18) 0%, transparent 50%)",
        }}
      />

      {/* Layer 3: UI shell */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
        }}
      >
        <TitleBar />
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <SidebarProvider defaultOpen={true} style={{ minHeight: 0, height: "100%" }}>
            <AppSidebar section={section} onSectionChange={onSectionChange} />
            <SidebarInset
              style={{
                background: "transparent",
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
                minHeight: 0,
              }}
            >
              {children}
            </SidebarInset>
          </SidebarProvider>
        </div>
      </div>
    </div>
  );
}
