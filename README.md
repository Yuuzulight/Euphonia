# Euphonia

![HLdkXJnXwAAVpuS.jpg](HLdkXJnXwAAVpuS.jpg)

This is the only part of this repo that is primarily written by a human!! I am warning you this because I think AI disclosure is important.

This is a cozy voice feminization tool that will analyze your voice and show you metrics. I am not a professional, these metrics are my best understanding of what is useful and accurate but could be entirely wrong. Please use this as only one tool in your voice fem toolkit.

For best results, I recommend that you read the same passage with a similar microphone for all of your tests, so they can be reliably compared. I personally use the Rainbow Passage.

There are two ways to use Euphonia, depending on whether you want a click-and-run app or you're comfortable with a coding agent:

## Desktop app (recommended if you just want to use it)

Euphonia is available as a Windows desktop app — no coding agent, no terminal, nothing to install except the app itself. It:

- Records a take right in the app (just click the mic button)
- Runs the same acoustic analysis (pitch, resonance, register, jitter/shimmer, etc.) locally, via a bundled analyzer — nothing is uploaded anywhere for the metrics themselves
- Writes you a short, personalized, encouraging insight per take using the free Gemini API (optional — everything else works with no key at all; see the in-app setup guide, or [`docs/gemini-api-key.md`](docs/gemini-api-key.md))
- Keeps all your recordings and data on your own machine, in your own user folder — no accounts, no server, nothing sent anywhere except (optionally) Google's Gemini API for the written insight

**Currently Windows-only.** (The original design considered a macOS build too, but only Windows has actually been built so far — if you're on a Mac, use the developer workflow below for now.)

**Getting it:** grab the latest installer from the project's Releases page, or build it yourself — see "Building the desktop app" below.

**The "Windows protected your PC" warning:** the installer isn't code-signed (no certificate — not worth the cost for a small group of friends), so Windows SmartScreen will flag it as from an unrecognized publisher the first time it's run. This is expected, not a sign anything's broken. Click **"More info"**, then **"Run anyway"** to proceed.

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
