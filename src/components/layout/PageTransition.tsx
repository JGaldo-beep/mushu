import { motion, useIsPresent } from "framer-motion";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      style={
        isPresent
          ? { height: "100%", minHeight: 0 }
          : { position: "absolute", inset: 0 }
      }
    >
      {children}
    </motion.div>
  );
}
