# Voice Garden Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Voice Garden as an installable Electron desktop app — no server, no accounts — that records audio, runs the existing Praat/parselmouth analysis, and generates a free Gemini-powered written insight per recording, replacing the current "clone the repo + ask a coding agent" workflow.

**Architecture:** Electron main process spawns the existing `analyze.py` as a subprocess (dev: via `uv run`; packaged: a PyInstaller-frozen executable) and serves the existing `dashboard-react` renderer through a custom `app://` protocol that transparently redirects the small set of *dynamic* paths (`recordings.json`, `audio/*`, `analysis/*`) to the OS per-user data directory while everything else is served read-only from the built bundle — so almost none of the existing React code changes. New IPC channels (recording upload, Gemini insight generation, API key settings) are exposed to the renderer via a `contextBridge` preload script.

**Tech Stack:** Electron (main/preload, plain TypeScript + `tsc`, no extra Electron framework), the existing Vite/React/TS `dashboard-react` app (unmodified build tooling), Python/`uv`/parselmouth (existing `analyze.py`, extended not rewritten), `electron-builder` for packaging, Gemini API via Node's built-in `fetch` (no SDK dependency), Electron's built-in `safeStorage` for the API key (no `keytar`/`electron-store`).

## Global Constraints

- No new backend, database, or accounts — spec explicitly rules these out.
- No new production npm dependencies beyond `electron` — use Node/Electron built-ins (`fetch`, `safeStorage`, `fs`) wherever they cover the need.
- `analyze.py`'s existing CLI behavior (no `--output-root` passed) must stay byte-for-byte the same, since the repo's documented coding-agent workflow (`CLAUDE.md`) depends on it.
- All existing `dashboard-react` components (`StatCard`, `MetricModal`, `WaveformPlayer`, `AnnotationsProvider`, `zones.ts`, etc.) must keep working via `fetch("${import.meta.env.BASE_URL}...")` unchanged — the protocol layer, not the components, absorbs the desktop-app data-location change.
- Insights are optional: with no Gemini key, every existing dashboard feature (metrics, charts, reference comparison, waveform playback) must work exactly as today.
- Follow the repo's existing conventions from `CLAUDE.md`: MASC-blue only for register crashes, warm/specific copy, no bare `React` import (automatic JSX runtime).

---

## File Structure

```
voice-training-ui/
  analyze.py                                  (MODIFY)
  dashboard-react/
    src/
      types.ts                                (MODIFY: add GeneratedInsight type)
      App.tsx                                 (MODIFY: mount RecordButton/OnboardingModal, swap region.insights)
      vg-bridge.ts                             (NEW: typed window.voiceGarden accessor)
      components/
        RecordButton.tsx                      (NEW)
        GeneratedInsight.tsx                  (NEW)
        OnboardingModal.tsx                   (NEW)
  electron/                                    (NEW)
    package.json
    tsconfig.json
    electron-builder.yml
    src/
      main.ts
      preload.ts
      protocol.ts
      paths.ts
      sidecar.ts
      settings.ts
      gemini.ts
      ipcHandlers.ts
  docs/
    gemini-api-key.md                         (NEW)
  scripts/
    build_sidecar.py                          (NEW)
    test_analyze_paths.py                     (NEW)
```

---

### Task 1: Electron shell + custom protocol serving the existing dashboard

**Files:**
- Create: `electron/package.json`, `electron/tsconfig.json`
- Create: `electron/src/paths.ts`
- Create: `electron/src/protocol.ts`
- Create: `electron/src/main.ts`
- Create: `electron/src/preload.ts`

**Interfaces:**
- Produces: `getUserDataRoot(): string` (`paths.ts`) — the OS per-user app-data dir, used by every later task.
- Produces: `registerAppProtocol(distDir: string, userDataRoot: string): void` (`protocol.ts`) — call once before `app.whenReady()`.
- Produces: `app://dashboard/index.html` as the URL every window loads.

- [ ] **Step 1: Scaffold the Electron package**

`electron/package.json`:
```json
{
  "name": "voice-garden-electron",
  "private": true,
  "version": "0.1.0",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -b",
    "start": "npm run build && electron ."
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.1.8",
    "typescript": "^5.6.3",
    "@types/node": "^22.9.0"
  }
}
```

`electron/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "electron"]
  },
  "include": ["src"]
}
```

Run: `cd electron && npm install`
Expected: `node_modules` created, no errors.

- [ ] **Step 2: `paths.ts` — the one place that knows where user data lives**

```typescript
// electron/src/paths.ts
import { app } from "electron";
import path from "node:path";

export function getUserDataRoot(): string {
  return app.getPath("userData");
}

export function getAudioDir(): string {
  return path.join(getUserDataRoot(), "audio");
}

export function getAnalysisDir(): string {
  return path.join(getUserDataRoot(), "analysis");
}

export function getRecordingsJsonPath(): string {
  return path.join(getUserDataRoot(), "recordings.json");
}

// The built dashboard-react static bundle. In dev, dashboard-react/dist
// sits two levels above electron/dist/. When packaged, electron-builder
// copies it to process.resourcesPath/dashboard (see Task 10).
export function getRendererDistDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "dashboard");
  }
  return path.join(__dirname, "..", "..", "dashboard-react", "dist");
}
```

- [ ] **Step 3: `protocol.ts` — route dynamic paths to userData, everything else to the built bundle**

```typescript
// electron/src/protocol.ts
import { net, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getAudioDir, getAnalysisDir, getRecordingsJsonPath, getRendererDistDir } from "./paths";

export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function isDynamicPath(pathname: string): boolean {
  return (
    pathname === "recordings.json" ||
    pathname.startsWith("audio/") ||
    pathname.startsWith("analysis/")
  );
}

export function registerAppProtocolHandler(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    // app://dashboard/<pathname>
    let pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (pathname === "") pathname = "index.html";

    if (isDynamicPath(pathname)) {
      const filePath =
        pathname === "recordings.json"
          ? getRecordingsJsonPath()
          : pathname.startsWith("audio/")
            ? path.join(getAudioDir(), pathname.slice("audio/".length))
            : path.join(getAnalysisDir(), pathname.slice("analysis/".length));

      if (!fs.existsSync(filePath)) {
        if (pathname === "recordings.json") {
          return new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    }

    // Static bundle asset (JS/CSS/HTML/reference.json/reference-audio/favicons).
    const filePath = path.join(getRendererDistDir(), pathname);
    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
```

- [ ] **Step 4: `main.ts` — wire it together**

```typescript
// electron/src/main.ts
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerAppProtocolScheme, registerAppProtocolHandler } from "./protocol";

registerAppProtocolScheme();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL("app://dashboard/index.html");
}

app.whenReady().then(() => {
  registerAppProtocolHandler();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 5: Empty `preload.ts` placeholder (filled in Task 3+)**

```typescript
// electron/src/preload.ts
// contextBridge APIs are added in Task 3 (recordings) and Task 5 (settings).
export {};
```

- [ ] **Step 6: Build the renderer and verify the shell boots**

Run:
```bash
cd dashboard-react && npm install && npm run build
cd ../electron && npm run build && npx electron .
```
Expected: a window opens showing the Voice Garden hero, "no recordings yet 🌸" empty state, and a working "What do these mean?" cheat sheet — proving both the static bundle and the empty-`recordings.json` dynamic path resolve correctly through the custom protocol.

- [ ] **Step 7: Commit**

The root `.gitignore` already ignores any `dist/`/`node_modules/` folder (including `electron/dist`, `electron/node_modules`), so only source files get staged:
```bash
git add electron/package.json electron/tsconfig.json electron/src
git commit -m "feat: add Electron shell with app:// protocol serving the dashboard"
```

---

### Task 2: `analyze.py` — parametrize output location and ffmpeg path

**Files:**
- Modify: `analyze.py`
- Create: `scripts/test_analyze_paths.py`

**Interfaces:**
- Produces: `resolve_paths(output_root: str | None) -> Paths` (dataclass with `recordings_json`, `mirror_recordings_json: Path | None`, `audio_dir`, `analysis_dir`) — used by `main()` and `backfill()`, and by Task 3's sidecar invocation (which always passes `--output-root`).
- Produces: `--output-root PATH` and `--id` CLI args (id already existed); `FFMPEG_BIN` env var override.

- [ ] **Step 1: Write the failing test**

`scripts/test_analyze_paths.py`:
```python
"""Smoke test for analyze.py's resolve_paths(). Run directly: `uv run scripts/test_analyze_paths.py`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from analyze import resolve_paths, ROOT


def test_default_paths_unchanged():
    p = resolve_paths(None)
    assert p.recordings_json == ROOT / "recordings.json"
    assert p.mirror_recordings_json == ROOT / "dashboard-react" / "public" / "recordings.json"
    assert p.audio_dir == ROOT / "dashboard-react" / "public" / "audio"
    assert p.analysis_dir == ROOT / "dashboard-react" / "public" / "analysis"


def test_output_root_single_location():
    p = resolve_paths("/tmp/voicegarden-userdata")
    root = Path("/tmp/voicegarden-userdata")
    assert p.recordings_json == root / "recordings.json"
    assert p.mirror_recordings_json is None
    assert p.audio_dir == root / "audio"
    assert p.analysis_dir == root / "analysis"


if __name__ == "__main__":
    test_default_paths_unchanged()
    test_output_root_single_location()
    print("✅ resolve_paths OK")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run scripts/test_analyze_paths.py`
Expected: `ImportError: cannot import name 'resolve_paths'`

- [ ] **Step 3: Implement `resolve_paths` and wire it in**

In `analyze.py`, replace the module-level path constants block:
```python
ROOT = Path(__file__).resolve().parent
RECORDINGS_JSON = ROOT / "recordings.json"  # source of truth

# The React dashboard (dashboard-react) reads these at runtime from public/.
APP_PUBLIC = ROOT / "dashboard-react" / "public"
PUBLIC_RECORDINGS_JSON = APP_PUBLIC / "recordings.json"
AUDIO_DIR = APP_PUBLIC / "audio"
ANALYSIS_DIR = APP_PUBLIC / "analysis"
```
with:
```python
import os
from dataclasses import dataclass

ROOT = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Paths:
    recordings_json: Path
    mirror_recordings_json: Path | None  # dev workflow only; None when --output-root is used
    audio_dir: Path
    analysis_dir: Path


def resolve_paths(output_root: str | None) -> Paths:
    """Default (no output_root): today's dev-workflow layout, dual-written
    (repo-root recordings.json = source of truth, dashboard-react/public/
    mirrored for the Vite dev server). With output_root (the desktop app's
    per-user data dir): a single self-contained location, no mirror."""
    if output_root is None:
        app_public = ROOT / "dashboard-react" / "public"
        return Paths(
            recordings_json=ROOT / "recordings.json",
            mirror_recordings_json=app_public / "recordings.json",
            audio_dir=app_public / "audio",
            analysis_dir=app_public / "analysis",
        )
    root = Path(output_root)
    return Paths(
        recordings_json=root / "recordings.json",
        mirror_recordings_json=None,
        audio_dir=root / "audio",
        analysis_dir=root / "analysis",
    )
```

Update `to_wav_mono` to use the env override:
```python
def to_wav_mono(src: Path) -> Path:
    """Convert any audio file to a temp mono WAV for analysis via ffmpeg."""
    tmp = Path(tempfile.mkdtemp()) / "analysis.wav"
    ffmpeg_bin = os.environ.get("FFMPEG_BIN", "ffmpeg")
    subprocess.run(
        [ffmpeg_bin, "-y", "-i", str(src), "-ac", "1", "-ar", "44100", str(tmp)],
        check=True,
        capture_output=True,
    )
    return tmp
```

Update `load_recordings`/`save_recordings` to take a `Paths` argument instead of the old module-level constants:
```python
def load_recordings(paths: Paths) -> list[dict]:
    if paths.recordings_json.exists():
        return json.loads(paths.recordings_json.read_text())
    return []


def save_recordings(paths: Paths, recordings: list[dict]) -> None:
    payload = json.dumps(recordings, indent=2)
    paths.recordings_json.parent.mkdir(parents=True, exist_ok=True)
    paths.recordings_json.write_text(payload)
    if paths.mirror_recordings_json is not None:
        paths.mirror_recordings_json.parent.mkdir(parents=True, exist_ok=True)
        paths.mirror_recordings_json.write_text(payload)
```

Update every other reference to the old constants (`RECORDINGS_JSON`, `APP_PUBLIC`, `PUBLIC_RECORDINGS_JSON`, `AUDIO_DIR`, `ANALYSIS_DIR`) in `backfill()` and `main()` to take a `paths: Paths` parameter built from a new `--output-root` CLI arg, e.g. in `main()`:
```python
    parser.add_argument(
        "--output-root", default=None,
        help="Write recordings.json/audio/analysis under this directory instead of "
             "the repo's default dev layout (used by the desktop app).",
    )
    args = parser.parse_args()
    paths = resolve_paths(args.output_root)

    if args.backfill:
        backfill(paths)
        return
    ...
    recordings = load_recordings(paths)
    ...
    paths.audio_dir.mkdir(parents=True, exist_ok=True)
    paths.analysis_dir.mkdir(parents=True, exist_ok=True)
    ...
    shutil.copy2(src, paths.audio_dir / playback_name)
    (paths.analysis_dir / f"{rec_id}.json").write_text(json.dumps(detail))
    ...
    save_recordings(paths, recordings)
```
(`backfill()` gets the same `paths` threading — replace its internal `AUDIO_DIR`/`ANALYSIS_DIR`/`load_recordings()`/`save_recordings()` uses accordingly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run scripts/test_analyze_paths.py`
Expected: `✅ resolve_paths OK`

- [ ] **Step 5: Verify the existing dev workflow still works unchanged**

Run: `uv run analyze.py --backfill` (if you have any local recordings) or, with a sample file:
```bash
uv run analyze.py "/path/to/any.mp3" --label "regression check"
```
Expected: same output locations as before (`recordings.json` at repo root + `dashboard-react/public/recordings.json` mirror) — diff `git status` shows no unexpected new paths.

- [ ] **Step 6: Commit**

```bash
git add analyze.py scripts/test_analyze_paths.py
git commit -m "feat: parametrize analyze.py output location and ffmpeg binary"
```

---

### Task 3: Recording IPC — sidecar invocation + `recordings:create`

**Files:**
- Create: `electron/src/sidecar.ts`
- Create: `electron/src/ipcHandlers.ts` (recordings portion)
- Modify: `electron/src/main.ts` (call `registerIpcHandlers()`)
- Modify: `electron/src/preload.ts`
- Create: `dashboard-react/src/vg-bridge.ts`

**Interfaces:**
- Consumes: `getAudioDir/getAnalysisDir/getRecordingsJsonPath/getUserDataRoot` from Task 1's `paths.ts`.
- Produces: `runAnalyze(input: { audioTempPath: string; label: string; note?: string }): Promise<void>` (`sidecar.ts`) — spawns `analyze.py` with `--output-root <userDataRoot>`.
- Produces: IPC channel `"recordings:create"`, payload `{ audioBase64: string; mimeType: string; label: string; note?: string }`, resolves `void` (renderer refetches `recordings.json` itself, matching the existing polling-free but refetch-on-mount pattern).
- Produces: `window.voiceGarden.createRecording(audio: Blob, label: string, note?: string): Promise<void>` (`vg-bridge.ts`).

- [ ] **Step 1: `sidecar.ts` — spawn analyze.py, dev vs packaged**

```typescript
// electron/src/sidecar.ts
import { app } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { getUserDataRoot } from "./paths";

export interface AnalyzeInput {
  audioTempPath: string;
  label: string;
  note?: string;
}

function getFfmpegBinPath(): string | null {
  if (!app.isPackaged) return null; // rely on ffmpeg already on PATH in dev
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(process.resourcesPath, "ffmpeg", `ffmpeg${ext}`);
}

function getSidecarCommand(): { cmd: string; args: string[]; cwd: string } {
  const repoRoot = path.resolve(__dirname, "..", "..");
  if (!app.isPackaged) {
    return { cmd: "uv", args: ["run", "analyze.py"], cwd: repoRoot };
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  const exe = path.join(process.resourcesPath, "sidecar", `analyze${ext}`);
  return { cmd: exe, args: [], cwd: process.resourcesPath };
}

export function runAnalyze(input: AnalyzeInput): Promise<void> {
  const { cmd, args, cwd } = getSidecarCommand();
  const fullArgs = [
    ...args,
    input.audioTempPath,
    "--label",
    input.label,
    "--output-root",
    getUserDataRoot(),
  ];
  if (input.note) fullArgs.push("--note", input.note);

  const ffmpegBin = getFfmpegBinPath();
  const env = { ...process.env, ...(ffmpegBin ? { FFMPEG_BIN: ffmpegBin } : {}) };

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, fullArgs, { cwd, env });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`analyze.py exited ${code}: ${stderr}`));
    });
  });
}
```

- [ ] **Step 2: `ipcHandlers.ts` — the `recordings:create` handler**

```typescript
// electron/src/ipcHandlers.ts
import { ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runAnalyze } from "./sidecar";

interface CreateRecordingPayload {
  audioBase64: string;
  mimeType: string; // e.g. "audio/webm"
  label: string;
  note?: string;
}

function extFromMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("wav")) return ".wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return ".mp3";
  return ".m4a";
}

export function registerIpcHandlers(): void {
  ipcMain.handle("recordings:create", async (_event, payload: CreateRecordingPayload) => {
    const tempPath = path.join(
      os.tmpdir(),
      `voicegarden-${randomUUID()}${extFromMimeType(payload.mimeType)}`,
    );
    fs.writeFileSync(tempPath, Buffer.from(payload.audioBase64, "base64"));
    try {
      await runAnalyze({ audioTempPath: tempPath, label: payload.label, note: payload.note });
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  });
}
```

- [ ] **Step 3: Wire into `main.ts`**

```typescript
// electron/src/main.ts — add near the top and inside app.whenReady()
import { registerIpcHandlers } from "./ipcHandlers";
// ...
app.whenReady().then(() => {
  registerAppProtocolHandler();
  registerIpcHandlers();
  createWindow();
  ...
```

- [ ] **Step 4: `preload.ts` — expose `createRecording`**

```typescript
// electron/src/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("voiceGarden", {
  createRecording: (payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }) => ipcRenderer.invoke("recordings:create", payload),
});
```

- [ ] **Step 5: Renderer-side typed bridge**

```typescript
// dashboard-react/src/vg-bridge.ts
export interface VoiceGardenBridge {
  createRecording(payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }): Promise<void>;
}

declare global {
  interface Window {
    voiceGarden: VoiceGardenBridge;
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1)); // strip data: URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 6: Manual verification**

Run: `cd electron && npm run build && npx electron .`, then in the DevTools console (View → Toggle Developer Tools):
```js
fetch("app://dashboard/reference.json").then(r => r.json()).then(console.log) // sanity: static path still works
```
then, with a real short audio file available on disk, exercise the IPC path from DevTools:
```js
const buf = await (await fetch("file:///C:/path/to/test.wav")).arrayBuffer();
const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
await window.voiceGarden.createRecording({ audioBase64: b64, mimeType: "audio/wav", label: "manual test" });
```
Expected: no error thrown; reloading the window (Ctrl+R) shows the new take in "All recordings" and as the active take — proving the sidecar wrote `recordings.json`/`audio/`/`analysis/` into userData and the protocol layer picked it up with zero renderer changes.

- [ ] **Step 7: Commit**

```bash
git add electron/src/sidecar.ts electron/src/ipcHandlers.ts electron/src/main.ts electron/src/preload.ts dashboard-react/src/vg-bridge.ts
git commit -m "feat: wire recording upload through IPC to the analyze.py sidecar"
```

---

### Task 4: `RecordButton` — record in-app via MediaRecorder

**Files:**
- Create: `dashboard-react/src/components/RecordButton.tsx`
- Modify: `dashboard-react/src/App.tsx`

**Interfaces:**
- Consumes: `window.voiceGarden.createRecording` and `blobToBase64` from Task 3's `vg-bridge.ts`.
- Produces: `<RecordButton onRecorded={() => void}>` — calls `onRecorded` after a successful upload so `App.tsx` can refetch `recordings.json`.

- [ ] **Step 1: Component**

```tsx
// dashboard-react/src/components/RecordButton.tsx
import { useRef, useState } from "react";
import { blobToBase64 } from "../vg-bridge";

export function RecordButton({ onRecorded }: { onRecorded: () => void }) {
  const [state, setState] = useState<"idle" | "recording" | "saving" | "error">("idle");
  const [label, setLabel] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    recorderRef.current = recorder;
    setState("recording");
  }

  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });
    setState("saving");
    try {
      const audioBase64 = await blobToBase64(blob);
      await window.voiceGarden.createRecording({
        audioBase64,
        mimeType: blob.type,
        label: label.trim() || "untitled take",
      });
      setLabel("");
      setState("idle");
      onRecorded();
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  return (
    <div className="record-panel">
      {state === "idle" && (
        <>
          <input
            type="text"
            placeholder="what are you trying this take? 🌱"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button onClick={start}>🎙️ record</button>
        </>
      )}
      {state === "recording" && <button onClick={stop}>⏹️ stop &amp; analyze</button>}
      {state === "saving" && <span>analyzing… 🌸</span>}
      {state === "error" && <span>couldn't save that take 🌧️ — try again</span>}
    </div>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`**

Add the import and, right after the `<header className="hero">…</header>` block, mount it with a refetch callback that reuses the existing fetch effect logic:

```tsx
// dashboard-react/src/App.tsx — add import
import { RecordButton } from "./components/RecordButton";

// inside App(): extract the existing recordings-fetch effect body into a
// named function so RecordButton can trigger the same refetch on success
function refetchRecordings() {
  fetch(`${import.meta.env.BASE_URL}recordings.json?t=${Date.now()}`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data: Recording[]) => setRecordings([...data].sort((a, b) => a.id - b.id)))
    .catch((e) => setError(String(e)));
}

useEffect(refetchRecordings, []);
```
then render `<RecordButton onRecorded={refetchRecordings} />` immediately below the hero header.

- [ ] **Step 3: Manual verification**

Run: `cd dashboard-react && npm run build && cd ../electron && npx electron .`
Expected: type a label, click record, speak for a few seconds, click stop — the button shows "analyzing…", then the dashboard refreshes in place showing the new take without a manual window reload.

- [ ] **Step 4: Commit**

```bash
git add dashboard-react/src/components/RecordButton.tsx dashboard-react/src/App.tsx
git commit -m "feat: add in-app recording via MediaRecorder"
```

---

### Task 5: API key settings via `safeStorage`

**Files:**
- Create: `electron/src/settings.ts`
- Modify: `electron/src/ipcHandlers.ts`
- Modify: `electron/src/preload.ts`
- Modify: `dashboard-react/src/vg-bridge.ts`

**Interfaces:**
- Produces: `getApiKey(): string | null`, `setApiKey(key: string): void`, `clearApiKey(): void` (`settings.ts`).
- Produces: IPC channels `"settings:getStatus"` → `{ hasKey: boolean }`, `"settings:setKey"` payload `string` → `void`, `"settings:clearKey"` → `void`.
- Produces: `window.voiceGarden.settings.getStatus/setKey/clearKey` on the bridge.

- [ ] **Step 1: `settings.ts`**

```typescript
// electron/src/settings.ts
import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getUserDataRoot } from "./paths";

function getKeyFilePath(): string {
  return path.join(getUserDataRoot(), "gemini-key.enc");
}

export function getApiKey(): string | null {
  const file = getKeyFilePath();
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(file));
  } catch {
    return null;
  }
}

export function setApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-level encryption is not available on this machine.");
  }
  fs.mkdirSync(getUserDataRoot(), { recursive: true });
  fs.writeFileSync(getKeyFilePath(), safeStorage.encryptString(key));
}

export function clearApiKey(): void {
  const file = getKeyFilePath();
  if (fs.existsSync(file)) fs.rmSync(file);
}
```

- [ ] **Step 2: IPC handlers**

Add to `electron/src/ipcHandlers.ts`:
```typescript
import { getApiKey, setApiKey, clearApiKey } from "./settings";

// inside registerIpcHandlers():
ipcMain.handle("settings:getStatus", () => ({ hasKey: getApiKey() !== null }));
ipcMain.handle("settings:setKey", (_event, key: string) => setApiKey(key));
ipcMain.handle("settings:clearKey", () => clearApiKey());
```

- [ ] **Step 3: Preload + renderer bridge**

`electron/src/preload.ts` — extend the exposed object:
```typescript
contextBridge.exposeInMainWorld("voiceGarden", {
  createRecording: (payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }) => ipcRenderer.invoke("recordings:create", payload),
  settings: {
    getStatus: () => ipcRenderer.invoke("settings:getStatus"),
    setKey: (key: string) => ipcRenderer.invoke("settings:setKey", key),
    clearKey: () => ipcRenderer.invoke("settings:clearKey"),
  },
});
```

`dashboard-react/src/vg-bridge.ts` — extend the interface:
```typescript
export interface VoiceGardenBridge {
  createRecording(payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }): Promise<void>;
  settings: {
    getStatus(): Promise<{ hasKey: boolean }>;
    setKey(key: string): Promise<void>;
    clearKey(): Promise<void>;
  };
}
```

- [ ] **Step 4: Manual verification**

Run: `cd electron && npm run build && npx electron .`, in DevTools console:
```js
await window.voiceGarden.settings.getStatus()      // { hasKey: false }
await window.voiceGarden.settings.setKey("test-123")
await window.voiceGarden.settings.getStatus()      // { hasKey: true }
await window.voiceGarden.settings.clearKey()
await window.voiceGarden.settings.getStatus()      // { hasKey: false }
```
Expected: matches the comments above; inspect `<userData>/gemini-key.enc` and confirm it's binary/encrypted, not plaintext.

- [ ] **Step 5: Commit**

```bash
git add electron/src/settings.ts electron/src/ipcHandlers.ts electron/src/preload.ts dashboard-react/src/vg-bridge.ts
git commit -m "feat: store the Gemini API key via Electron safeStorage"
```

---

### Task 6: Gemini insight generation

**Files:**
- Create: `electron/src/gemini.ts`
- Modify: `electron/src/ipcHandlers.ts`
- Modify: `electron/src/preload.ts`
- Modify: `dashboard-react/src/vg-bridge.ts`
- Modify: `dashboard-react/src/types.ts`

**Interfaces:**
- Consumes: `getApiKey()` from Task 5, `getAnalysisDir()` from Task 1.
- Produces: `generateInsight(recording: RecordingSummary): Promise<GeneratedInsight>` (`gemini.ts`) — calls the Gemini API, caches to `<userData>/analysis/<id>-insight.json`.
- Produces: IPC `"insights:generate"` payload `{ recordingId: number }` → `GeneratedInsight`, throws `{ code: "NO_API_KEY" }` (serialized as `Error` with `.message === "NO_API_KEY"`) if no key set.
- Produces: IPC `"insights:get"` payload `{ recordingId: number }` → `GeneratedInsight | null` (reads the cache without calling the API).
- Produces (`types.ts`): `GeneratedInsight { summary: string; strengths: string[]; focus_area: string; tip: string; generated_at: string }`.

- [ ] **Step 1: Add the type to `dashboard-react/src/types.ts`**

```typescript
// dashboard-react/src/types.ts — append
export interface GeneratedInsight {
  summary: string;
  strengths: string[];
  focus_area: string;
  tip: string;
  generated_at: string;
}
```

- [ ] **Step 2: `gemini.ts`**

```typescript
// electron/src/gemini.ts
import fs from "node:fs";
import path from "node:path";
import { getAnalysisDir } from "./paths";
import { getApiKey } from "./settings";

export interface RecordingSummary {
  id: number;
  label: string;
  pitch: { mean_hz: number | null };
  formants: { f2_hz: number | null };
  voice_quality: { hnr_db: number | null; jitter_pct: number | null };
  weight?: { h1a3c_db: number | null };
  register?: {
    in_register_pct: number | null;
    offset_sub_pct: number | null;
    phrases_landed_pct: number | null;
  };
}

export interface GeneratedInsight {
  summary: string;
  strengths: string[];
  focus_area: string;
  tip: string;
  generated_at: string;
}

const GEMINI_MODEL = "gemini-2.5-flash";
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    focus_area: { type: "STRING" },
    tip: { type: "STRING" },
  },
  required: ["summary", "strengths", "focus_area", "tip"],
};

function cachePath(recordingId: number): string {
  return path.join(getAnalysisDir(), `${recordingId}-insight.json`);
}

export function readCachedInsight(recordingId: number): GeneratedInsight | null {
  const file = cachePath(recordingId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function buildPrompt(r: RecordingSummary): string {
  return `You are a warm, encouraging voice-feminization coach. Numbers are a
compass, not a judge — always pair any weakness with one concrete, doable
next step, and end warm. Never use the word "masculine" as a generic
put-down; it only applies literally to register crashes.

This take (#${r.id}, "${r.label}"):
- pitch mean: ${r.pitch.mean_hz ?? "n/a"} Hz
- resonance F2: ${r.formants.f2_hz ?? "n/a"} Hz
- clarity (HNR): ${r.voice_quality.hnr_db ?? "n/a"} dB
- steadiness (jitter): ${r.voice_quality.jitter_pct ?? "n/a"}%
- weight (spectral tilt): ${r.weight?.h1a3c_db ?? "n/a"} dB
- % time in register: ${r.register?.in_register_pct ?? "n/a"}%
- sub-register at phrase endings: ${r.register?.offset_sub_pct ?? "n/a"}%
- phrase endings landed in register: ${r.register?.phrases_landed_pct ?? "n/a"}%

Write a short summary (2-3 sentences), 2-3 genuine strengths, one clear
focus_area naming the single most clockable thing to work on, and one
concrete tip (a specific, doable exercise).`;
}

export async function generateInsight(r: RecordingSummary): Promise<GeneratedInsight> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(r) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini API returned no content");
  const parsed = JSON.parse(text) as Omit<GeneratedInsight, "generated_at">;

  const insight: GeneratedInsight = { ...parsed, generated_at: new Date().toISOString() };
  fs.mkdirSync(getAnalysisDir(), { recursive: true });
  fs.writeFileSync(cachePath(r.id), JSON.stringify(insight, null, 2));
  return insight;
}
```

- [ ] **Step 3: IPC handlers**

Add to `electron/src/ipcHandlers.ts`:
```typescript
import { generateInsight, readCachedInsight, type RecordingSummary } from "./gemini";

// inside registerIpcHandlers():
ipcMain.handle("insights:get", (_event, recordingId: number) => readCachedInsight(recordingId));
ipcMain.handle("insights:generate", (_event, recording: RecordingSummary) =>
  generateInsight(recording),
);
```

- [ ] **Step 4: Preload + renderer bridge**

`electron/src/preload.ts` — extend:
```typescript
insights: {
  get: (recordingId: number) => ipcRenderer.invoke("insights:get", recordingId),
  generate: (recording: unknown) => ipcRenderer.invoke("insights:generate", recording),
},
```

`dashboard-react/src/vg-bridge.ts` — extend the interface:
```typescript
import type { GeneratedInsight, Recording } from "./types";

// add to VoiceGardenBridge:
insights: {
  get(recordingId: number): Promise<GeneratedInsight | null>;
  generate(recording: Recording): Promise<GeneratedInsight>;
};
```

- [ ] **Step 5: Manual verification**

With a real Gemini key (free, from Google AI Studio) set via the Task 5 console commands, in DevTools:
```js
await window.voiceGarden.insights.generate({ id: 1, label: "test", pitch: {mean_hz: 190}, formants: {f2_hz: 2000}, voice_quality: {hnr_db: 15, jitter_pct: 1.2}, register: {in_register_pct: 80, offset_sub_pct: 20, phrases_landed_pct: 75} })
```
Expected: resolves with `{ summary, strengths, focus_area, tip, generated_at }`; `<userData>/analysis/1-insight.json` now exists; calling `window.voiceGarden.insights.get(1)` returns the same cached object without another network call (check DevTools Network tab shows no new request).

- [ ] **Step 6: Commit**

```bash
git add electron/src/gemini.ts electron/src/ipcHandlers.ts electron/src/preload.ts dashboard-react/src/vg-bridge.ts dashboard-react/src/types.ts
git commit -m "feat: generate and cache per-recording insights via the Gemini API"
```

---

### Task 7: `GeneratedInsight` renderer component

**Files:**
- Create: `dashboard-react/src/components/GeneratedInsight.tsx`
- Modify: `dashboard-react/src/App.tsx`

**Interfaces:**
- Consumes: `window.voiceGarden.insights.get/generate` (Task 6), `InsightCard`/`Drill` from `../annotations/lib`.
- Produces: `<GeneratedInsight recording={active} onNeedsApiKey={() => void}>` — replaces the `region.insights` `<Region>` placeholder in `App.tsx`.

- [ ] **Step 1: Component**

```tsx
// dashboard-react/src/components/GeneratedInsight.tsx
import { useEffect, useState } from "react";
import type { GeneratedInsight as GeneratedInsightData, Recording } from "../types";
import { InsightCard } from "../annotations/lib/InsightCard";
import { Drill } from "../annotations/lib/Drill";

export function GeneratedInsight({
  recording,
  onNeedsApiKey,
}: {
  recording: Recording;
  onNeedsApiKey: () => void;
}) {
  const [insight, setInsight] = useState<GeneratedInsightData | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "generating" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
    window.voiceGarden.insights.get(recording.id).then((cached) => {
      setInsight(cached);
      setStatus("idle");
    });
  }, [recording.id]);

  async function generate() {
    setStatus("generating");
    try {
      const result = await window.voiceGarden.insights.generate(recording);
      setInsight(result);
      setStatus("idle");
    } catch (e) {
      if (e instanceof Error && e.message.includes("NO_API_KEY")) {
        onNeedsApiKey();
        setStatus("idle");
      } else {
        console.error(e);
        setStatus("error");
      }
    }
  }

  if (status === "loading") return null;

  if (insight) {
    return (
      <InsightCard
        title={insight.focus_area}
        badges={insight.strengths}
      >
        <p>{insight.summary}</p>
        <Drill title="Try this">{insight.tip}</Drill>
      </InsightCard>
    );
  }

  return (
    <div className="insight-placeholder">
      ✍️ no insight for take #{recording.id} yet.
      <br />
      <button onClick={generate} disabled={status === "generating"}>
        {status === "generating" ? "writing…" : "✨ generate insight"}
      </button>
      {status === "error" && <p>couldn't generate that insight 🌧️ — try again</p>}
    </div>
  );
}
```

- [ ] **Step 2: Swap into `App.tsx`**

Replace:
```tsx
<Region
  id="region.insights"
  empty={
    <div className="insight-placeholder">
      ✍️ no custom insight written for take #{active.id} yet.
      <br />
      ask Claude to "analyze this recording" — it'll design one right
      here.
    </div>
  }
/>
```
with:
```tsx
<GeneratedInsight recording={active} onNeedsApiKey={() => setShowOnboarding(true)} />
```
(`setShowOnboarding` is introduced in Task 8; add the import `import { GeneratedInsight } from "./components/GeneratedInsight";`.)

- [ ] **Step 3: Manual verification**

Run: `cd dashboard-react && npm run build && cd ../electron && npx electron .`
Expected: the Insights section shows a "generate insight" button for a take with no cached insight; clicking it (with a key set from Task 5/6) shows "writing…" then renders the summary/strengths/tip through the existing pastel `InsightCard`/`Drill` styling; reloading the window shows the cached insight immediately with no button.

- [ ] **Step 4: Commit**

```bash
git add dashboard-react/src/components/GeneratedInsight.tsx dashboard-react/src/App.tsx
git commit -m "feat: render Gemini-generated insights in the dashboard"
```

---

### Task 8: First-run onboarding + Settings

**Files:**
- Create: `docs/gemini-api-key.md`
- Create: `dashboard-react/src/components/OnboardingModal.tsx`
- Modify: `dashboard-react/src/App.tsx`

**Interfaces:**
- Consumes: `window.voiceGarden.settings.getStatus/setKey/clearKey` (Task 5).
- Produces: `<OnboardingModal open={boolean} onClose={() => void}>` — shown on first launch (no key, not yet dismissed this session) and reopenable as "Settings" from the header.

- [ ] **Step 1: The guide content (single source of truth, also readable on GitHub)**

`docs/gemini-api-key.md`:
```markdown
# Getting a free Gemini API key

Voice Garden uses this key only to write your per-recording insight — it's
never sent anywhere except Google's Gemini API, and it's stored encrypted
on your own machine.

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Sign in with a Google account.
3. Click **Create API key**.
4. Copy the key and paste it into Voice Garden's setup screen (or Settings,
   any time later).

Gemini's free tier is rate-limited but plenty for occasional personal use.
You can skip this step and add a key later — everything except the written
insight works without one.
```

- [ ] **Step 2: `OnboardingModal.tsx`**

```tsx
// dashboard-react/src/components/OnboardingModal.tsx
import { useState } from "react";

const GUIDE_STEPS = [
  ["Go to Google AI Studio", "aistudio.google.com/apikey"],
  ["Sign in with a Google account", ""],
  ["Click \u201cCreate API key\u201d", ""],
  ["Copy the key and paste it below", ""],
] as const;

export function OnboardingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function save() {
    if (!key.trim()) return;
    setSaving(true);
    await window.voiceGarden.settings.setKey(key.trim());
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal onboarding">
        <h2>🌷 welcome to Voice Garden</h2>
        <p>add a free Gemini key to get written insights per take:</p>
        <ol>
          {GUIDE_STEPS.map(([step, link], i) => (
            <li key={i}>
              {step}
              {link && (
                <>
                  {" — "}
                  <a href={`https://${link}`} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
        <input
          type="password"
          placeholder="paste your Gemini API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <div className="modal-actions">
          <button onClick={onClose}>skip for now</button>
          <button onClick={save} disabled={saving || !key.trim()}>
            {saving ? "saving…" : "save key"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `App.tsx`**

Add state and a mount-time check:
```tsx
// imports
import { OnboardingModal } from "./components/OnboardingModal";

// inside App():
const [showOnboarding, setShowOnboarding] = useState(false);

useEffect(() => {
  window.voiceGarden.settings.getStatus().then(({ hasKey }) => {
    if (!hasKey) setShowOnboarding(true);
  });
}, []);
```
Render at the end of the returned JSX, alongside the existing `{modal && <MetricModal .../>}`:
```tsx
<OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
```
Add a small "⚙️ settings" button in the header that also does `setShowOnboarding(true)`, so the same modal serves as first-run onboarding and later key editing.

- [ ] **Step 4: Manual verification**

Delete `<userData>/gemini-key.enc` if present, run the packaged/dev app.
Expected: the onboarding modal appears on launch with the four numbered steps and a working link to `aistudio.google.com/apikey`; "skip for now" closes it and the dashboard works normally; the header "settings" button reopens it at any time; saving a key closes the modal and subsequent `insights.generate` calls succeed without the `NO_API_KEY` path.

- [ ] **Step 5: Commit**

```bash
git add docs/gemini-api-key.md dashboard-react/src/components/OnboardingModal.tsx dashboard-react/src/App.tsx
git commit -m "feat: add first-run Gemini key onboarding and settings modal"
```

---

### Task 9: PyInstaller sidecar build

**Files:**
- Create: `scripts/build_sidecar.py`
- Modify: `pyproject.toml` (add `pyinstaller` as a dev dependency)

**Interfaces:**
- Produces: `dist-sidecar/analyze` (or `analyze.exe` on Windows) — a standalone executable with the same CLI as `analyze.py`, used by Task 10's packaging and by `electron/src/sidecar.ts`'s `app.isPackaged` branch (already written in Task 3).

- [ ] **Step 1: Add PyInstaller as a dev dependency**

Run: `uv add --dev pyinstaller`
Expected: `pyproject.toml` gains a `[dependency-groups] dev = ["pyinstaller>=6.0"]` (or similar) section; `uv.lock` updates.

- [ ] **Step 2: Build script**

`scripts/build_sidecar.py`:
```python
"""Freeze analyze.py into a standalone executable for packaging.

Usage: uv run scripts/build_sidecar.py
Output: dist-sidecar/analyze[.exe]
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--onefile",
            "--name",
            "analyze",
            "--distpath",
            str(ROOT / "dist-sidecar"),
            "--workpath",
            str(ROOT / "build-sidecar"),
            "--specpath",
            str(ROOT / "build-sidecar"),
            str(ROOT / "analyze.py"),
        ],
        check=True,
        cwd=ROOT,
    )
    print("✅ sidecar built at dist-sidecar/")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run it and verify the frozen binary works standalone**

Run:
```bash
uv run scripts/build_sidecar.py
```
Then, with ffmpeg on PATH and a sample audio file:
```bash
./dist-sidecar/analyze "/path/to/sample.mp3" --label "sidecar smoke test" --output-root /tmp/vg-sidecar-test
```
Expected: exits 0, and `/tmp/vg-sidecar-test/{recordings.json,audio/,analysis/}` are populated — proving the frozen executable (no local Python/uv needed to run it) reproduces `uv run analyze.py`'s behavior.

- [ ] **Step 4: Commit**

`dist-sidecar/` and `build-sidecar/` are build output but don't match the root `.gitignore`'s `dist/`/`build/` patterns (those only match folders with those exact names) — add them explicitly:
```
# scripts/build_sidecar.py output
dist-sidecar/
build-sidecar/
```
appended to the root `.gitignore`, then:
```bash
git add pyproject.toml uv.lock scripts/build_sidecar.py .gitignore
git commit -m "feat: add PyInstaller build script for the analyze.py sidecar"
```

---

### Task 10: electron-builder packaging

**Files:**
- Create: `electron/electron-builder.yml`
- Modify: `electron/package.json` (add `dist` script)

**Interfaces:**
- Consumes: `dashboard-react/dist` (Task 1), `dist-sidecar/analyze[.exe]` (Task 9), a downloaded static ffmpeg binary.
- Produces: a Windows installer (`electron/release/*.exe`) that launches into a working, empty-state Voice Garden.

- [ ] **Step 1: Fetch a static ffmpeg build for bundling**

Download a static Windows ffmpeg build (e.g. from ffmpeg.org's official builds page) and place the resulting `ffmpeg.exe` at `electron/resources/ffmpeg/ffmpeg.exe`. This is a one-time manual asset step — record the exact source URL used in a comment at the top of `electron-builder.yml` so it can be re-fetched/updated later.

- [ ] **Step 2: `electron-builder.yml`**

```yaml
# ffmpeg.exe sourced from: <fill in the exact release URL used in Step 1>
appId: com.voicegarden.desktop
productName: Voice Garden
directories:
  output: release
files:
  - dist/**/*
  - package.json
extraResources:
  - from: ../dashboard-react/dist
    to: dashboard
  - from: ../dist-sidecar
    to: sidecar
  - from: resources/ffmpeg
    to: ffmpeg
win:
  target: nsis
```

- [ ] **Step 3: Add the packaging script**

`electron/package.json` — add to `"scripts"`:
```json
"dist": "npm run build && electron-builder"
```

- [ ] **Step 4: Build and verify the installer end-to-end**

Run (from repo root):
```bash
cd dashboard-react && npm run build
cd ../electron && npm run build && npx electron-builder
```
Install the resulting `electron/release/*.exe` and launch it. Expected, in order:
1. App opens showing the empty-state dashboard (no dev tooling, no Python/Node/ffmpeg installed on the test machine).
2. Onboarding modal appears; skip it.
3. Record a real take with the 🎙️ button — the frozen sidecar + bundled ffmpeg run without any local Python/uv/ffmpeg install, and the take appears on the dashboard.
4. Add a Gemini key via Settings and generate an insight for that take successfully.

This is the full spec acceptance test — if all four steps pass, the desktop app fulfills the design doc end-to-end.

- [ ] **Step 5: Commit**

`electron/release/` (electron-builder's output) needs an explicit `.gitignore` entry for the same reason as Task 9's `dist-sidecar/`. The ffmpeg binary itself (tens of MB) should NOT be committed to git — ignore it too, and rely on the URL comment in `electron-builder.yml` for any teammate (or you, later) to re-fetch it:
```
# electron-builder output
electron/release/

# fetched manually, see electron/electron-builder.yml for the source URL
electron/resources/ffmpeg/
```
appended to the root `.gitignore`, then:
```bash
git add electron/electron-builder.yml electron/package.json .gitignore
git commit -m "feat: package Voice Garden as a Windows installer via electron-builder"
```
