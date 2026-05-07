import { motion } from "framer-motion";

const BARS = [
  { delay: 0,    heights: [5, 14, 7, 16, 5] },
  { delay: 0.18, heights: [12, 5, 15, 8, 12] },
  { delay: 0.09, heights: [7, 16, 5, 13, 7] },
  { delay: 0.27, heights: [14, 6, 12, 5, 14] },
];

export function LogoIcon() {
  return (
    <div
      style={{
        width: "16px",
        height: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "2px",
        flexShrink: 0,
      }}
    >
      {BARS.map(({ delay, heights }, i) => (
        <motion.div
          key={i}
          style={{
            width: "2px",
            borderRadius: "1px",
            background: "linear-gradient(to top, #b8e62a, #e7ff7a)",
            flexShrink: 0,
          }}
          animate={{ height: heights.map((h) => `${h * 0.7}px`) }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
