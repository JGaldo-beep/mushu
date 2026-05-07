import { createContext, useContext, type ReactNode } from "react";
import { useHistory } from "@/hooks/useHistory";

type HistoryContextValue = ReturnType<typeof useHistory>;

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const history = useHistory();
  return (
    <HistoryContext.Provider value={history}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistoryContext(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error("useHistoryContext must be used inside HistoryProvider");
  return ctx;
}
