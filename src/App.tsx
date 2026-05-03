import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  BriefcaseBusiness,
  CircleHelp,
  Code2,
  Copy,
  Languages,
  Mail,
  MessageCircle,
  MessageSquareReply,
  Mic,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";

type ModeName =
  | "DEFAULT"
  | "EMAIL"
  | "FORMAL"
  | "CASUAL"
  | "CODE"
  | "HELP"
  | "REPLY_EN"
  | "TRANSLATE";

type ModeInfo = {
  name: ModeName;
  /** Etiqueta en español desde el backend ("Modo correo", …). */
  label: string;
  color: string;
  icon:
    | "Mic"
    | "Mail"
    | "BriefcaseBusiness"
    | "MessageCircle"
    | "Code2"
    | "CircleHelp"
    | "MessageSquareReply"
    | "Languages";
};

type FrontendState = {
  mode: ModeInfo;
  hotkey: string;
  model: string;
  has_groq_key: boolean;
  microphones: string[];
  selected_microphone: string | null;
};

type HistoryItem = {
  id: number;
  timestamp: string;
  raw_text: string;
  processed_text: string;
  mode_used: ModeName;
  duration_ms: number;
};

const modeIconMap = {
  Mic,
  Mail,
  BriefcaseBusiness,
  MessageCircle,
  Code2,
  CircleHelp,
  MessageSquareReply,
  Languages,
} as const;

const modeColorMap: Record<ModeName, string> = {
  DEFAULT: "#FFFFFF",
  EMAIL: "#3B82F6",
  FORMAL: "#8B5CF6",
  CASUAL: "#10B981",
  CODE: "#F59E0B",
  HELP: "#F472B6",
  REPLY_EN: "#38BDF8",
  TRANSLATE: "#A78BFA",
};

const modeLabelMap: Record<ModeName, string> = {
  DEFAULT: "Modo general",
  EMAIL: "Modo correo",
  FORMAL: "Modo formal",
  CASUAL: "Modo casual",
  CODE: "Modo código",
  HELP: "Modo ayuda",
  REPLY_EN: "Modo responder (EN)",
  TRANSLATE: "Modo traducir",
};

const ALL_MODES: ModeName[] = [
  "DEFAULT",
  "EMAIL",
  "FORMAL",
  "CASUAL",
  "CODE",
  "HELP",
  "REPLY_EN",
  "TRANSLATE",
];

function App() {
  const [recording, setRecording] = useState(false);
  const [mode, setMode] = useState<ModeInfo>({
    name: "DEFAULT",
    label: "Modo general",
    color: "#FFFFFF",
    icon: "Mic",
  });
  const [hotkey, setHotkey] = useState("Ctrl+Space");
  const [model, setModel] = useState("llama-3.1-8b-instant");
  const [groqKey, setGroqKey] = useState("");
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [microphones, setMicrophones] = useState<string[]>([]);
  const [microphone, setMicrophone] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState("Listo para dictar.");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ModeIcon = useMemo(() => modeIconMap[mode.icon] ?? Mic, [mode.icon]);

  const refreshHistory = async () => {
    const rows = await invoke<HistoryItem[]>("get_history");
    setHistory(rows);
  };

  const refreshState = async () => {
    const state = await invoke<FrontendState>("get_frontend_state");
    const m = state.mode;
    setMode({
      ...m,
      label: m.label || modeLabelMap[m.name as ModeName] || m.name,
    });
    setHotkey(state.hotkey);
    setModel(state.model);
    setHasGroqKey(state.has_groq_key);
    setMicrophones(state.microphones ?? []);
    setMicrophone(state.selected_microphone ?? "");
  };

  useEffect(() => {
    refreshState().catch((e) => setError(String(e)));
    refreshHistory().catch((e) => setError(String(e)));

    const unlistenStart = listen("recording_started", (event) => {
      setRecording(true);
      setStatus("Grabando…");
      const payload = event.payload as ModeInfo | null;
      if (payload?.name) {
        setMode({
          ...payload,
          label: payload.label || modeLabelMap[payload.name as ModeName] || payload.name,
        });
      }
    });

    const unlistenStop = listen("recording_stopped", () => {
      setRecording(false);
    });

    const unlistenProcessing = listen("dictation_processing", (event) => {
      const active = (event.payload as { active?: boolean })?.active === true;
      if (active) {
        setRecording(false);
        setStatus("Pensando…");
      }
    });

    const unlistenDone = listen("transcription_done", (event) => {
      const payload = event.payload as { text: string; mode: ModeInfo };
      setRecording(false);
      setStatus(payload?.text ? "Texto pegado correctamente." : "Sin texto para pegar.");
      if (payload?.mode?.name) {
        const m = payload.mode;
        setMode({
          ...m,
          label: m.label || modeLabelMap[m.name as ModeName] || m.name,
        });
      }
      refreshHistory().catch((e) => setError(String(e)));
    });

    const unlistenMode = listen("mode_changed", (event) => {
      const payload = event.payload as ModeInfo;
      setMode({
        ...payload,
        label: payload.label || modeLabelMap[payload.name as ModeName] || payload.name,
      });
      setStatus(payload.label || modeLabelMap[payload.name as ModeName] || payload.name);
    });

    const unlistenError = listen("transcription_error", (event) => {
      setError(String(event.payload ?? "Error de transcripción"));
    });

    const unlistenGroq = listen("groq_error", (event) => {
      const msg = String(event.payload ?? "Groq no disponible");
      setError(`Groq: ${msg}. Se pegó el texto sin reescritura (solo Whisper).`);
    });

    const unlistenMushu = listen("mushu_reply", (event) => {
      const payload = event.payload as { text?: string };
      setError("");
      setStatus(payload?.text ? `Mushu: ${payload.text}` : "Mushu respondió.");
    });

    const unlistenModeOk = listen("mode_switch_ok", (event) => {
      const payload = event.payload as ModeInfo;
      if (payload?.name) {
        setMode({
          ...payload,
          label: payload.label || modeLabelMap[payload.name as ModeName] || payload.name,
        });
      }
      const lab = payload?.label || modeLabelMap[payload.name as ModeName] || payload?.name || "";
      setStatus(lab ? `${lab} · activo` : "Modo actualizado.");
    });

    return () => {
      unlistenStart.then((f) => f());
      unlistenStop.then((f) => f());
      unlistenProcessing.then((f) => f());
      unlistenDone.then((f) => f());
      unlistenMode.then((f) => f());
      unlistenError.then((f) => f());
      unlistenGroq.then((f) => f());
      unlistenMushu.then((f) => f());
      unlistenModeOk.then((f) => f());
    };
  }, []);

  const saveAll = async () => {
    try {
      setSaving(true);
      setError("");
      if (groqKey.trim()) {
        await invoke("save_groq_api_key", { key: groqKey.trim() });
        setGroqKey("");
        setHasGroqKey(true);
      }
      await invoke("save_settings", {
        input: { hotkey, model, microphone: microphone || null },
      });
      setStatus("Configuración guardada.");
      await refreshState();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const refreshMics = async () => {
    try {
      setError("");
      await refreshState();
      setStatus("Lista de micrófonos actualizada.");
    } catch (e) {
      setError(String(e));
    }
  };

  const testGroq = async () => {
    try {
      setError("");
      const msg = await invoke<string>("test_groq");
      setStatus(msg);
    } catch (e) {
      setError(String(e));
    }
  };

  const iconForMode = (m: ModeName): ModeInfo["icon"] => {
    if (m === "EMAIL") return "Mail";
    if (m === "FORMAL") return "BriefcaseBusiness";
    if (m === "CASUAL") return "MessageCircle";
    if (m === "CODE") return "Code2";
    if (m === "HELP") return "CircleHelp";
    if (m === "REPLY_EN") return "MessageSquareReply";
    if (m === "TRANSLATE") return "Languages";
    return "Mic";
  };

  const selectMode = async (target: ModeName) => {
    try {
      setError("");
      await invoke("set_mode", { mode: target });
      setMode({
        name: target,
        label: modeLabelMap[target],
        color: modeColorMap[target],
        icon: iconForMode(target),
      });
    } catch (e) {
      setError(String(e));
    }
  };

  const clear = async () => {
    await invoke("clear_history");
    await refreshHistory();
  };

  const copy = async (text: string) => {
    await invoke("copy_to_clipboard", { text });
    setStatus("Texto copiado al portapapeles.");
  };

  return (
    <main className="container">
      <section className="panel mode-panel">
        <div className="mode-header">
          <div className="mode-chip" style={{ borderColor: mode.color }}>
            <ModeIcon size={17} color={mode.color} strokeWidth={2} />
            <span style={{ color: mode.color }}>{mode.label}</span>
          </div>
          <span className={`dot ${recording ? "active" : ""}`} />
        </div>
        <p className="status">{status}</p>
        {error && <p className="error">{error}</p>}
        <div className="mode-grid" role="group" aria-label="Modo de dictado">
          {ALL_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-btn ${mode.name === m ? "active" : ""}`}
              onClick={() => selectMode(m)}
              aria-pressed={mode.name === m}
              title={m}
            >
              {modeLabelMap[m].replace(/^Modo /, "")}
            </button>
          ))}
        </div>
        <p className="mode-hint">
          <strong>Ayuda:</strong> cualquier dictado → respuesta sobre Mushu (overlay).{" "}
          <strong>Responder (EN):</strong> copia el texto en inglés (Ctrl+C), dicta cómo quieres
          responder → se pega en inglés.           <strong>Traducir:</strong> dicta el texto (cualquier idioma) → español en overlay y
          portapapeles.
        </p>
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <label>
          Hotkey
          <input value={hotkey} onChange={(e) => setHotkey(e.target.value)} />
        </label>
        <label>
          Modelo Groq
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
            <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
          </select>
        </label>
        <label>
          Micrófono
          <select value={microphone} onChange={(e) => setMicrophone(e.target.value)}>
            <option value="">Predeterminado de Windows</option>
            {microphones.map((mic) => (
              <option key={mic} value={mic}>
                {mic}
              </option>
            ))}
          </select>
        </label>
        <button className="ghost-btn" onClick={refreshMics}>
          Actualizar mics
        </button>
        <label>
          Groq API Key {hasGroqKey ? "(guardada)" : ""}
          <input
            type="password"
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder="gsk_..."
          />
        </label>
        <button className="ghost-btn" type="button" onClick={testGroq} disabled={!hasGroqKey && !groqKey.trim()}>
          Probar Groq
        </button>
        <button className="save-btn" onClick={saveAll} disabled={saving}>
          <Save size={16} />
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </section>

      <section className="panel history-panel">
        <div className="history-head">
          <h2>Historial (últimos 20)</h2>
          <button className="ghost-btn" onClick={clear}>
            <Trash2 size={14} />
            Limpiar
          </button>
        </div>
        <div className="history-list">
          {history.map((item) => (
            <article key={item.id} className="history-row">
              <div className="history-meta">
                <span style={{ color: modeColorMap[item.mode_used] }}>{item.mode_used}</span>
                <span>{new Date(item.timestamp).toLocaleString()}</span>
                <span>{item.duration_ms}ms</span>
              </div>
              <p>{item.processed_text}</p>
              <button className="ghost-btn" onClick={() => copy(item.processed_text)}>
                <Copy size={14} />
                Copiar
              </button>
            </article>
          ))}
          {!history.length && <p className="empty">Todavía no hay transcripciones.</p>}
        </div>
      </section>
    </main>
  );
}

export default App;
