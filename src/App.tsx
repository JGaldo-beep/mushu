import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { PageTransition } from "@/components/layout/PageTransition";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useTheme } from "@/hooks/useTheme";
import type { NavSection } from "@/lib/types";
import { HistoryPage } from "@/pages/HistoryPage";
import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";

function App() {
  const [section, setSection] = useState<NavSection>("home");
  const { theme, setTheme } = useTheme();
  const onboarding = useOnboarding();

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
        {!onboarding.loading && onboarding.open && onboarding.snapshot && (
          <OnboardingWizard
            hotkey={onboarding.snapshot.hotkey}
            modeHotkey={onboarding.snapshot.mode_hotkey}
            hasGroqKey={onboarding.snapshot.has_groq_key}
            onComplete={onboarding.complete}
            onNavigateSettings={setSection}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
