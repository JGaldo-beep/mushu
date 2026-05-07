import React from "react";
import ReactDOM from "react-dom/client";
import { Overlay } from "./Overlay";
import "./overlay.css";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <Overlay />
    </React.StrictMode>,
  );
}
