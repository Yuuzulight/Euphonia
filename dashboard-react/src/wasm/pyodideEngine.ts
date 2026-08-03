// Lazy-loaded Praat/parselmouth engine running fully client-side via
// Pyodide/WebAssembly. Same analyze.py pitch/formant/voice-quality/intensity/
// weight logic (see public/wasm/analysis_core.py, ported verbatim), same
// Praat engine, verified numerically identical to the native desktop build
// for the same input audio -- see the feasibility prototype writeup.
//
// This is the browser-mode equivalent of electron/src/sidecar.ts (which
// spawns the frozen analyze.exe as a subprocess instead).

import type { Register, RecordingDetail } from "../types";

// Pyodide's own type declarations aren't installed as a dependency here (the
// runtime loads from a CDN <script> tag) -- minimal shape of what's used.
interface PyodideInterface {
  version: string;
  loadPackage(names: string | string[]): Promise<void>;
  pyimport(name: string): { install(pkgs: string[]): Promise<void> };
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  FS: { writeFile(path: string, data: Uint8Array): void };
}
declare global {
  interface Window {
    loadPyodide?: (opts?: { indexURL?: string }) => Promise<PyodideInterface>;
  }
}

const PYODIDE_VERSION = "314.0.3";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const WHEEL_URL = `${import.meta.env.BASE_URL}wasm/praat_parselmouth-0.5.0.dev0-cp314-cp314-pyemscripten_2026_0_wasm32.whl`;
const CORE_PY_URL = `${import.meta.env.BASE_URL}wasm/analysis_core.py`;

export type EngineStatus = "idle" | "loading" | "ready" | "error";

let enginePromise: Promise<PyodideInterface> | null = null;
let statusListeners: ((s: EngineStatus) => void)[] = [];
let currentStatus: EngineStatus = "idle";

function setStatus(s: EngineStatus) {
  currentStatus = s;
  statusListeners.forEach((cb) => cb(s));
}

export function onEngineStatus(cb: (s: EngineStatus) => void): () => void {
  statusListeners.push(cb);
  cb(currentStatus);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== cb);
  };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function bootEngine(): Promise<PyodideInterface> {
  setStatus("loading");
  if (!window.loadPyodide) {
    await loadScript(`${PYODIDE_CDN}pyodide.js`);
  }
  const pyodide = await window.loadPyodide!({ indexURL: PYODIDE_CDN });
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install(["numpy", WHEEL_URL]);
  const coreSrc = await (await fetch(CORE_PY_URL)).text();
  pyodide.runPython(coreSrc);
  setStatus("ready");
  return pyodide;
}

/** Idempotent -- concurrent/repeat calls all await the same boot. */
export function getEngine(): Promise<PyodideInterface> {
  if (!enginePromise) {
    enginePromise = bootEngine().catch((err) => {
      setStatus("error");
      enginePromise = null; // allow retry
      throw err;
    });
  }
  return enginePromise;
}

export interface StandardMetrics {
  duration_s: number | null;
  pitch: { mean_hz: number | null; median_hz: number | null; min_hz: number | null; max_hz: number | null; range_hz: number | null; sd_hz: number | null };
  formants: { f1_hz: number | null; f2_hz: number | null; f3_hz: number | null };
  voice_quality: { hnr_db: number | null; jitter_pct: number | null; shimmer_pct: number | null };
  intensity: { mean_db: number | null; min_db: number | null; max_db: number | null };
  weight: { h1a3c_db: number | null; h1a3_db: number | null; tilt_db_khz: number | null };
}

export interface FullAnalysisResult {
  metrics: StandardMetrics;
  register: Register;
  detail: RecordingDetail;
}

/**
 * Runs the ported analyze.py + analyze_register() pipelines on a WAV file's
 * raw bytes, in one Pyodide round-trip (both need the same parsed Sound).
 */
export async function analyzeWav(
  wavBytes: Uint8Array,
  registerFloor = 130.0,
): Promise<FullAnalysisResult> {
  const pyodide = await getEngine();
  pyodide.FS.writeFile("/rec.wav", wavBytes);
  const resultJson = await pyodide.runPythonAsync(`
import parselmouth, json
sound = parselmouth.Sound("/rec.wav")
metrics = analyze(sound)
detail, register = analyze_register(sound, ${registerFloor})
json.dumps({"metrics": metrics, "register": register, "detail": detail})
`);
  return JSON.parse(resultJson as string);
}
