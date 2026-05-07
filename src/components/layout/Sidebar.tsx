import { Home, Settings, Sparkles, Wand2 } from "lucide-react";
import { LogoIcon } from "@/components/LogoIcon";
import { NavUser } from "@/components/layout/NavUser";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { NavSection } from "@/lib/types";

const NAV_ITEMS: { value: NavSection; icon: typeof Home; label: string }[] = [
  { value: "home", icon: Home, label: "Inicio" },
  { value: "modes", icon: Sparkles, label: "Modos" },
  { value: "ai-features", icon: Wand2, label: "AI Features" },
  { value: "settings", icon: Settings, label: "Ajustes" },
];

interface AppSidebarProps {
  section: NavSection;
  onSectionChange: (next: NavSection) => void;
}

export function AppSidebar({ section, onSectionChange }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader style={{ padding: "14px 16px 10px" }}>
        <div className="flex items-center gap-2.5">
          <LogoIcon />
          <span
            className="group-data-[collapsible=icon]:hidden"
            style={{
              fontFamily: "'Geist Variable', sans-serif",
              fontSize: "17px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.015em",
            }}
          >
            Mushu
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ value, icon: Icon, label }) => {
                const isActive = section === value;
                return (
                  <SidebarMenuItem key={value}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => onSectionChange(value)}
                      tooltip={label}
                      style={
                        isActive
                          ? {
                              borderLeft: "2px solid var(--accent-primary)",
                              borderRadius: "0 8px 8px 0",
                              paddingLeft: "calc(0.5rem - 2px)",
                              background: "rgba(209,255,58,0.12)",
                              color: "var(--accent-hover)",
                              fontWeight: 500,
                            }
                          : { color: "var(--text-secondary)", fontWeight: 500 }
                      }
                    >
                      <Icon
                        strokeWidth={isActive ? 2.25 : 1.85}
                        style={{ color: isActive ? "var(--accent-primary)" : undefined }}
                      />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter style={{ padding: "8px 8px 12px" }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavUser onNavigate={onSectionChange} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
