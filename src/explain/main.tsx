import React from "react";
import ReactDOM from "react-dom/client";
import { ExplainApp } from "./ExplainApp";
import "@/overlay/overlay.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ExplainApp />
  </React.StrictMode>,
);
