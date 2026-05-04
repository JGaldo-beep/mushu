import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Apply prefers-color-scheme synchronously to avoid a flash of wrong theme.
// useTheme() will reconcile with the user's saved preference on mount.
(() => {
  try {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark);
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
  } catch {
    /* ignore */
  }
})();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
