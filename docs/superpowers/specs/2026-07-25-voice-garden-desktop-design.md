# Voice Garden Desktop App — Design

## Goal

Turn Voice Garden from a repo you clone and drive via a coding agent into an
installable desktop app that friends can run on their own machines, with no
server, no accounts, and no per-install cost beyond an optional free Gemini
API key.

## Non-goals (explicitly out of scope for v1)

- No hosted backend, no multi-tenant database, no accounts/login.
- No auto-update.
- No mobile app.
- No job queue — analysis runs synchronously; recordings are short.

## Architecture

- **Shell:** Electron, wrapping the existing `dashboard-react` UI as the
  renderer. The renderer is Chromium, so `fetch`, `MediaRecorder`, and every
  existing component (`StatCard`, `MetricModal`, `WaveformPlayer`, the
  annotation lib, `zones.ts`, etc.) work unchanged.
- **Analysis sidecar:** `analyze.py` frozen into a standalone executable via
  PyInstaller (bundles parselmouth/Praat + ffmpeg). Electron's main process
  spawns it as a subprocess per new recording and reads its JSON output —
  the analysis code itself is not rewritten.
- **No server, no accounts:** each friend installs their own copy. There is
  nothing to log into.

## Data storage

No database. Everything lives in the OS per-user app-data folder (Electron's
`app.getPath('userData')`), in the **same file layout the repo already
uses** so the on-disk format needs no redesign:

```
<userData>/
  recordings.json
  audio/<id>.<ext>
  analysis/<id>.json
  analysis/<id>-insight.json   (new: cached Gemini output)
  settings.json                (Gemini key, via electron-store / OS keychain)
```

Reference-voice corpus (`reference.json`, `reference-audio/*.mp3`) ships
read-only inside the app bundle, unchanged from today.

## Recording flow

1. User clicks record → renderer's native `MediaRecorder` captures audio,
   no added library.
2. On stop, the renderer sends the audio blob to the main process via IPC.
3. Main process writes it to `audio/<id>.<ext>`, spawns the sidecar, waits
   for `analysis/<id>.json`, updates `recordings.json`.
4. Renderer refetches and the dashboard updates — no manual CLI step.

## Insight generation (Gemini API)

- Replaces the repo's current workflow (a human + Claude Code hand-authoring
  a bespoke `.tsx` file per recording), which doesn't work per-user in a
  shipped app.
- Main process calls the **Gemini API** (free tier) with the recording's
  metrics plus prior recordings for trend context, requesting structured
  JSON: `{ summary, strengths[], focus_area, tip }`.
- That JSON is rendered through the **existing** `InsightCard`/`Drill`
  components in `src/annotations/lib/` — no new visual system, the authoring
  step is what's automated, not the rendering.
- Result is cached to `analysis/<id>-insight.json` on first generation, so
  it's a one-time API call per recording, not a per-view call.
- Insights are optional: without a key, the dashboard (metrics, charts,
  waveform, reference comparison) works exactly as it does today. Only the
  written insight is gated.

## First-run onboarding

- On first launch, before the dashboard, show a setup modal:
  1. A short numbered guide for getting a free Gemini key (Google AI Studio
     → sign in → create key). The guide text is a single markdown file in
     the repo (`docs/gemini-api-key.md`) so it's one source of truth — the
     modal renders it, and it's also readable directly on GitHub.
  2. An input field to paste the key.
  3. A **"Skip for now"** option — lets the user into the dashboard with no
     key; the app prompts again the first time they trigger insight
     generation, and the key can be added/edited anytime from Settings.
- Key is stored locally only (`electron-store`/OS keychain), never sent
  anywhere but Google's Gemini API.

## Packaging

`electron-builder` producing a Windows `.exe` and macOS `.dmg`. No
auto-update in v1 — reinstalling covers the "small friend group" case; an
updater is a later addition if the app outgrows that.

## Open items for the implementation plan

- Exact PyInstaller build steps per platform (Windows/macOS) and how the
  sidecar executable is located/invoked from packaged vs. dev builds.
- IPC contract between renderer and main process (recording upload, insight
  trigger, settings read/write).
- Content of `docs/gemini-api-key.md`.
