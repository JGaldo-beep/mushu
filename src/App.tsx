import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { PageTransition } from "@/components/layout/PageTransition";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/useTheme";
import type { NavSection } from "@/lib/types";
import { HistoryPage } from "@/pages/HistoryPage";
import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";

function App() {
  const [section, setSection] = useState<NavSection>("home");
  const { theme, setTheme } = useTheme();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar
          section={section}
          onSectionChange={setSection}
          theme={theme}
          onThemeChange={setTheme}
        />
        <main className="relative min-h-0 flex-1 overflow-hidden bg-muted/40">
          <AnimatePresence mode="wait">
            <PageTransition key={section}>
              {section === "home" && <HomePage />}
              {section === "history" && <HistoryPage />}
              {section === "settings" && <SettingsPage />}
            </PageTransition>
          </AnimatePresence>
        </main>
        <Toaster richColors position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

export default App;
