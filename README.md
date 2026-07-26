# Euphonia

![HLdkXJnXwAAVpuS.jpg](HLdkXJnXwAAVpuS.jpg)

Euphonia is a voice-feminization training tool that analyzes recordings of your voice and surfaces clear, actionable metrics to help you track your progress over time.

Originally created by [scratchyone](https://github.com/scratchyone) as [voice-training-ui](https://github.com/scratchyone/voice-training-ui), and extended in this fork with automated Gemini-powered insights and a standalone desktop app.

These metrics are grounded in established acoustic research, not professional clinical guidance — please use Euphonia as one tool among several in your voice training toolkit, not a definitive assessment.

For results that are meaningfully comparable over time, read the same passage with a similar microphone setup for each recording. The Rainbow Passage is used as the reference passage throughout this guide.

There are two ways to use Euphonia, depending on whether you want a click-and-run app or you're comfortable with a coding agent:

## Desktop app (recommended if you just want to use it)

Euphonia is available as a Windows desktop app — no coding agent, no terminal, nothing to install except the app itself. All your recordings and data stay on your own machine, in your own user folder — no accounts, no server, nothing sent anywhere except (optionally) Google's Gemini API for the written insight.

**Currently Windows-only.** (The original design considered a macOS build too, but only Windows has actually been built so far — if you're on a Mac, use the developer workflow below for now.)

### 1. Install it

1. Go to the [**Releases page**](../../releases) and download the latest `Euphonia Setup *.exe`.
2. Run the installer.
3. Windows will show a blue **"Windows protected your PC"** warning — the installer isn't code-signed (no certificate; not worth the cost for a small group of friends), so this is expected, not a sign anything's broken. Click **"More info"**, then **"Run anyway"**.
4. The installer runs with no further prompts and launches Euphonia when done.

### 2. First launch: set up your Gemini key (optional)

On first launch, a setup screen appears offering to add a free **Gemini API key**. This key is only used to write your per-recording insight — everything else in the app (recording, all the metrics, charts, reference comparisons) works with no key at all. You can skip this and add it later.

To get a free key:
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Sign in with a Google account.
3. Click **Create API key**.
4. Copy the key and paste it into Euphonia's setup screen (or **Settings** — the ⚙️ button in the top-right of the app — any time later).

Gemini's free tier is rate-limited but plenty for occasional personal use. The key is stored encrypted on your machine (via Windows' own credential encryption) and is never sent anywhere except Google's Gemini API.

Click **"Skip for now"** if you'd rather set this up later — you can reopen this same screen anytime from **Settings**.

### 3. Record your first take

1. Type a short label for what you're practicing (e.g. "Rainbow Passage, morning") in the box next to the record button.
2. Click **🎙️ record**, allow microphone access if Windows asks, and read your passage.
3. Click **⏹️ stop & analyze** when you're done. The app analyzes the recording locally (a few seconds) and adds it to your dashboard.

For results you can actually compare over time, read the *same* passage with a *similar* microphone setup each time — I use the Rainbow Passage myself.

### 4. Read your results

The dashboard shows, for your latest take: pitch, resonance (formants), loudness, steadiness (jitter/shimmer), vocal weight, and a register/phrasing breakdown (where your voice stays in or falls out of your target range). Click any metric card to see the full scale with your past takes and real reference voices plotted on it, so you can see where you sit. The **"What do these mean?"** section at the bottom of the dashboard explains each metric in plain language. Every number is meant as a compass, not a judge — a hint toward what to work on next, never a verdict.

### 5. Get a written insight for a take

If you added a Gemini key, click **✨ generate insight** under "Insights for this take" to get a short, personalized, encouraging write-up of what's working and one concrete thing to try next. This is generated once per take and cached — it won't call the API again for the same recording.

### 6. Revisit settings later

Click the **⚙️** button in the top-right corner any time to add, change, or view your Gemini key setup again.

## Developer / coding-agent workflow

This is how the project was originally built, and it's still how you'd customize it, add features, or get the deeper hand-authored insight style (see `CLAUDE.md`) instead of the desktop app's automated Gemini insights.

Open your coding agent of choice and ask it to read `CLAUDE.md`. It will give you a summary of how to use this application and work with you to analyze your voice. `CLAUDE.md` also documents the desktop app's architecture in depth if you want to build on it.

Euphonia relies heavily on the use of Claude Code, please use Claude Code or a similar coding agent for this path. This produces analysis of each voice sample using AI based on your metrics; instead of embedding this into the UI, it is implemented using skills, so the primary way of interacting with this codebase (in the dev workflow) is via a coding agent, which will run the proper skills and update the UI with the results.

If you don't know what a coding agent is or how to do this — use the desktop app above instead.

## Building the desktop app

Prerequisites: **uv** (Python), **Node + npm**, **ffmpeg** on your PATH for the dev build steps below (the packaged app bundles its own copy for end users).

```fish
# 1. Build the dashboard UI
cd dashboard-react && npm install && npm run build && cd ..

# 2. Freeze the analyzer into a standalone executable
uv sync
uv run scripts/build_sidecar.py          # → dist-sidecar/analyze.exe

# 3. Stage a static ffmpeg build for bundling (not committed — fetch your own)
#    See the source URL comment at the top of electron/electron-builder.yml.
#    Place the binary at: electron/resources/ffmpeg/ffmpeg.exe

# 4. Build the Electron app + installer
cd electron && npm install && npm run build && npx electron-builder
# → electron/release/*.exe (installer) and electron/release/win-unpacked/ (unpacked build)
```

To run it in dev without packaging: `cd electron && npm run build && npx electron .` (spawns `analyze.py` via `uv run` instead of a frozen sidecar — you'll still need `ffmpeg` on PATH for this mode).

Full architecture — the Electron shell, the `app://` protocol that bridges the renderer to your local files, the IPC surface, the Gemini insight generation — is documented in `CLAUDE.md`.

## License

All code and content I wrote — `analyze.py`, the React dashboard, the Claude Code skill, and the docs — is licensed under the **MIT License** (see `LICENSE`).

Additionally, in jurisdictions where statements of this kind are legal, I dedicate my own code and content to the **public domain** — you may use it under either the MIT License or as public domain. (I offer this because many countries lack a legal framework for public-domain dedication.) This does **not** apply to the third-party assets credited below.

**Note on the analyzer's GPL dependency:** `analyze.py` uses **Praat** (via the **parselmouth** library) at runtime, both of which are **GPLv3**. The source here contains none of their code and is distributed source-only — you install parselmouth separately (via `uv`) — so this code stays MIT / public domain. **However**, if you distribute a *bundled artifact* that ships Praat/parselmouth together with this code (a compiled binary, a packaged app, a Docker image with them baked in, etc.), that combined work is covered by the **GPLv3** and must be licensed accordingly.

**What this means for the packaged Euphonia installer:** the desktop installer built via `electron/electron-builder.yml` bundles `analyze.exe` (a PyInstaller build that freezes in Praat/parselmouth) alongside a GPLv3 ffmpeg build. That combination is exactly the "bundled artifact" case above: the *source code* in this repo remains MIT/public domain as described, but the *built/packaged installer* is a combined work and is licensed as a whole under **GPLv3**, not MIT. License texts for Praat, parselmouth, and the bundled ffmpeg build are shipped alongside the installer in `electron/resources/licenses/` (see `THIRD-PARTY-LICENSES.md` there) so recipients of the installer receive the license notices GPLv3 requires.

## Credits & third-party assets

- **Reference voices** — the preview clips in `dashboard-react/public/reference-audio/` and the measured values in `reference.json` are derived from the **VCTK Corpus** (CSTR, University of Edinburgh — Veaux, Yamagishi & MacDonald), licensed **CC BY 4.0**. The clips were trimmed and transcoded. These files remain under **CC BY 4.0**. <https://datashare.ed.ac.uk/handle/10283/3443> · <https://creativecommons.org/licenses/by/4.0/>
- **Praat** (Boersma & Weenink) and **parselmouth** (Jadoul, Thompson & de Boer), both **GPLv3**, power `analyze.py`.
- Other dependencies (React, Vite, Electron, wavesurfer.js, NumPy, …) retain their own respective licenses.
