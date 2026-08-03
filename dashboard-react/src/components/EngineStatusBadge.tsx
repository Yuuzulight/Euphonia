import { useEffect, useState } from "react";
import { onEngineStatus, getEngine, type EngineStatus } from "../wasm/pyodideEngine";

// Browser-mode-only indicator: this build is running the WASM Praat engine
// instead of the desktop app's native sidecar. Also kicks off the (lazy)
// engine boot on mount, so it's warm before the first recording.
export function EngineStatusBadge() {
  const [status, setStatus] = useState<EngineStatus>("idle");

  useEffect(() => {
    const unsub = onEngineStatus(setStatus);
    getEngine().catch((e) => console.error("WASM engine failed to load:", e));
    return unsub;
  }, []);

  const text =
    status === "ready"
      ? "✨ browser prototype — Praat running via WebAssembly"
      : status === "error"
        ? "⚠️ engine failed to load — see console"
        : "⏳ loading Praat engine (WebAssembly)…";

  return <div className="engine-badge">{text}</div>;
}
