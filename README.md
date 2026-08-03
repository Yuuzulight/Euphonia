# Euphonia

![HLdkXJnXwAAVpuS.jpg](HLdkXJnXwAAVpuS.jpg)

Euphonia is a voice-feminization training tool. Record yourself, and it analyzes the recording and surfaces clear, actionable metrics so you can track your progress over time.

Originally created by [scratchyone](https://github.com/scratchyone) as [voice-training-ui](https://github.com/scratchyone/voice-training-ui). This fork adds automated Gemini-powered insights, a standalone desktop app, and a browser version.

These metrics are grounded in established acoustic research, not professional clinical guidance. Treat Euphonia as one tool among several in your voice training toolkit, not a definitive assessment.

For results that are meaningfully comparable over time, read the same passage with a similar microphone setup each time. The Rainbow Passage is used as the reference passage throughout this guide.

There are three ways to use Euphonia, depending on your platform and how comfortable you are with a coding agent:

## Desktop app (recommended if you just want to use it)

Euphonia is available as a Windows desktop app. No coding agent, no terminal, no account, no API key — install it, open it, record a take, and everything works instantly, including a written insight for every take. All your recordings and data stay on your own machine, in your own user folder.

**Currently Windows-only.** A macOS build was part of the original plan but hasn't actually been built yet. If you're on a Mac, use the developer workflow below for now.

### 1. Install it

1. Go to the [**Releases page**](../../releases) and download the latest `Euphonia Setup *.exe`.
2. Run the installer.
3. Windows will show a blue **"Windows protected your PC"** warning. That's expected — the installer isn't code-signed (no certificate; not worth the cost for a small group of friends), not a sign anything's broken. Click **"More info"**, then **"Run anyway"**.
4. The installer runs with no further prompts and launches Euphonia when done.

From then on, Euphonia checks for new versions in the background and downloads them automatically. You'll see a small toast in the corner when one's ready, with a **"restart to update"** button, so there's no need to revisit the Releases page yourself.

### 2. Record your first take — no setup needed

1. Type a short label for what you're practicing (e.g. "Rainbow Passage, morning") in the box next to the record button.
2. Click **🎙️ record**, allow microphone access if Windows asks, and read your passage.
3. Click **⏹️ stop & analyze** when you're done. The app analyzes the recording locally, in a few seconds, and adds it to your dashboard.

For results you can actually compare over time, read the *same* passage with a *similar* microphone setup each time. I use the Rainbow Passage myself.

### 3. Read your results

The dashboard shows, for your latest take: pitch, resonance (formants), loudness, steadiness (jitter/shimmer), vocal weight, and a register/phrasing breakdown of where your voice stays in or falls out of your target range. Click any metric card to see the full scale, with your past takes and real reference voices plotted alongside so you can see where you sit. The **"What do these mean?"** section at the bottom explains each metric in plain language. Every number here is meant as a compass, not a judge — a hint toward what to work on next, never a verdict.

### 4. Get a written insight for a take

Click **✨ generate insight** under "Insights for this take" for a short, honest write-up of what's working and the single clearest thing to try next. It's generated instantly from the metrics above, no setup or account required, and cached once generated so opening the same take again won't regenerate it.

### 5. (Optional) Upgrade to richer, AI-written insights

The built-in insight above is deliberately simple and reliable. It can't misread your numbers, but it also can't vary its phrasing much. If you'd like more personalized, varied writing instead, add a free **Gemini API key**:

1. Click the **⚙️** button in the top-right corner, any time.
2. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in with a Google account, and click **Create API key**.
3. Copy the key and paste it into the Settings screen.

Once a key is added, any take showing the built-in insight will offer a **"✨ upgrade to an AI-written insight"** button that swaps in the richer version. The key is stored encrypted on your machine and never sent anywhere except Google's Gemini API. Nothing else in the app changes or requires this — it's purely an upgrade, not a setup step.

### 6. Back up, or delete, your recordings

Open **⚙️ Settings** and click **💾 export all recordings** any time to save a full copy of your recordings, audio, and analysis to a folder of your choosing. It's a plain folder, not a locked-in format, so you can move or archive it however you like.

To remove a single take, use the small 🗑️ button on its card in **All recordings**. To clear your whole history at once, use **delete all recordings** in the Settings danger zone. Both ask for confirmation first and can't be undone, so back up first if you want to keep anything.

## Browser version (works on macOS, Linux, and mobile too)

**[yuuzulight.github.io/Euphonia](https://yuuzulight.github.io/Euphonia/)** — no install, no account. Works on any platform with a modern browser, phone included.

This runs the same Praat voice-analysis engine as the desktop app, compiled to WebAssembly. Everything happens locally in your browser tab: nothing is uploaded anywhere, and once the page has loaded once it works offline. Recordings live in your browser's local storage (IndexedDB) instead of a file on disk, so they stay on that device and in that browser. Export a backup (⚙️ Settings → 💾 export all recordings) if you want to move them elsewhere or keep a copy.

Everything from the desktop app works the same way here: instant written insights, the optional Gemini upgrade, delete/export, register & phrasing analysis. The one thing missing is auto-update — just refresh the page for the latest version.

**Mobile:** the layout and the full record → analyze → results flow have both been tested on phone-sized screens against the live site, so this is more than a "should probably work." The one piece I haven't verified on an actual phone yet is microphone capture itself — if that misbehaves on your device, [open an issue](../../issues).

## Developer / coding-agent workflow

This is how the project was originally built, and it's still how you'd customize it, add features, or get the deeper hand-authored insight style (see `CLAUDE.md`) instead of the desktop app's automated template or Gemini insights.

Open your coding agent of choice and ask it to read `CLAUDE.md`. It'll give you a summary of how the app works and help you analyze your voice from there — it also documents the desktop app's architecture in depth if you want to build on it.

Euphonia relies heavily on Claude Code, so use Claude Code or a similar coding agent for this path. Instead of embedding AI-generated analysis into the UI, it's implemented using skills — the coding agent runs those skills and updates the UI with the results.

If you don't know what a coding agent is, use the desktop app above instead.

## Building the desktop app

Prerequisites: **uv** (Python), **Node + npm**, and **ffmpeg** on your PATH for the dev build steps below. The packaged app bundles its own copy of ffmpeg for end users.

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

To run it in dev without packaging: `cd electron && npm run build && npx electron .`. This spawns `analyze.py` via `uv run` instead of a frozen sidecar, so you'll still need `ffmpeg` on PATH.

The full architecture — the Electron shell, the `app://` protocol that bridges the renderer to your local files, the IPC surface, the Gemini insight generation — is documented in `CLAUDE.md`.

## License

All code and content I wrote — `analyze.py`, the React dashboard, the Claude Code skill, and the docs — is licensed under the **MIT License** (see `LICENSE`).

I also dedicate my own code and content to the **public domain**, in jurisdictions where that's legally meaningful — use it under the MIT License or as public domain, whichever suits you. (Many countries lack a legal framework for public-domain dedication, which is why the MIT License is there too.) This doesn't apply to the third-party assets credited below.

**Note on the analyzer's GPL dependency:** `analyze.py` uses **Praat** (via the **parselmouth** library) at runtime, both GPLv3. This repo contains none of their code and is distributed source-only — you install parselmouth separately, via `uv` — so the source stays MIT / public domain. But if you distribute a *bundled artifact* that ships Praat/parselmouth together with this code (a compiled binary, a packaged app, a Docker image with them baked in), that combined work falls under GPLv3 and has to be licensed accordingly.

**What this means for the packaged Euphonia installer:** it bundles `analyze.exe` (a PyInstaller build that freezes in Praat/parselmouth) alongside a GPLv3 ffmpeg build. That's exactly the "bundled artifact" case above — the source code in this repo stays MIT/public domain, but the built installer, as a combined work, is licensed as a whole under GPLv3. License texts for Praat, parselmouth, and the bundled ffmpeg build ship alongside the installer in `electron/resources/licenses/` (see `THIRD-PARTY-LICENSES.md` there), so recipients get the notices GPLv3 requires.

## Credits & third-party assets

- **Reference voices** — the preview clips in `dashboard-react/public/reference-audio/` and the measured values in `reference.json` come from the **VCTK Corpus** (CSTR, University of Edinburgh — Veaux, Yamagishi & MacDonald), licensed **CC BY 4.0**. The clips were trimmed and transcoded but remain under CC BY 4.0. <https://datashare.ed.ac.uk/handle/10283/3443> · <https://creativecommons.org/licenses/by/4.0/>
- **Praat** (Boersma & Weenink) and **parselmouth** (Jadoul, Thompson & de Boer), both GPLv3, power `analyze.py`.
- Other dependencies (React, Vite, Electron, wavesurfer.js, NumPy, …) retain their own respective licenses.
