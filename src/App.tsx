import { listen } from "@tauri-apps/api/event";
import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [recording, setRecording] = useState(false);
  const [lastText, setLastText] = useState("");
  const [lastSampleCount, setLastSampleCount] = useState<number | null>(null);

  useEffect(() => {
    const unlistenStart = listen("recording_started", () => {
      setRecording(true);
      setLastSampleCount(null);
      setLastText("");
    });

    const unlistenStop = listen("recording_stopped", (event) => {
      setLastSampleCount(event.payload as number);
      setRecording(false);
    });

    const unlistenDone = listen("transcription_done", (event) => {
      setLastText(event.payload as string);
      setRecording(false);
    });

    return () => {
      unlistenStart.then(f => f());
      unlistenStop.then(f => f());
      unlistenDone.then(f => f());
    };
  }, []);

  return (
    <main className="container">
      <section className="recorder-panel">
        <div className={`mic-dot ${recording ? "active" : ""}`} />
        <div>
          <p className="status-label">{recording ? "Grabando..." : "Listo"}</p>
          <p className="status-detail">
            {recording
              ? "El microfono esta capturando audio."
              : lastSampleCount === null
                ? "Mantén Ctrl + Espacio para probar el microfono."
                : `${lastSampleCount.toLocaleString()} samples capturados.`}
          </p>
        </div>
      </section>
      {lastText && <div className="preview">{lastText}</div>}
    </main>
  );
}

export default App;
