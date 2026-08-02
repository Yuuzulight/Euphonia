# Euphonia 💗 — project guide for Claude

A cozy, quantitative **voice-feminization training tracker** for Rachel. She records
herself (usually the Rainbow Passage), tells you what she was practicing, and you
analyze it and surface — kindly and specifically — what to work on next.

If she shares a recording or asks how a take went, use the **`analyze-voice` skill**
(`.claude/skills/analyze-voice/SKILL.md`). It's the operating manual for the whole
workflow; this file is the why and the shape.

**Two ways this project runs, and this file covers both:**
1. **The dev/coding-agent workflow** (below, and the original design of this repo) —
   `uv run analyze.py` + `npm run dev`, with a coding agent hand-authoring each
   recording's insight via the annotation slot system. Use this when you're working
   *in* this codebase.
2. **The packaged Electron desktop app** — the same dashboard and analyzer, wrapped
   so a non-technical friend can install and run it standalone, with insights
   generated automatically via the Gemini API instead of a coding agent. See the
   **"Desktop app (Electron)"** section below for its architecture; the rest of this
   file (annotation system, icon conventions, color rules, analysis methodology)
   applies to both.

---

## Initial setup (first run — read this first if the project is fresh)

This may be a **starter copy**: the app, the `analyze-voice` skill, the reusable
annotation lib, the shared reference voices (`reference.json`), and an `_example`
annotation template are all here — but there may be **no recordings yet** (empty
`recordings.json`). The user adds their own; everything else is structure for you
to drive.

**Prerequisites** (install whatever's missing):
- **ffmpeg** — `brew install ffmpeg` (macOS) / `apt-get install ffmpeg` (Linux). Required by `analyze.py` to read mp3/m4a.
- **uv** — the Python/dependency manager (https://docs.astral.sh/uv). **Use uv, never pip.**
- **Node + npm** — for the dashboard.

**Bootstrap:**
```fish
uv sync                                   # Python deps (parselmouth, numpy) → .venv
cd dashboard-react && npm install         # dashboard deps
npm run dev                               # → http://localhost:5173
```

**Add the first recording** (this drives the whole dashboard):
```fish
uv run analyze.py "/path/to/recording.mp3" --label "what they were trying"
```
Refresh the dashboard. Then author that take's insight by following the
`analyze-voice` skill — copy `dashboard-react/src/annotations/entries/_example.tsx`
to `00N.tsx` (matching the new recording's id) and fill in the slots.

**Ownership note:** this guide and the skill were written for the original user
("Rachel"). Treat "the user" as whoever you're working with now — keep the same
warm, *compass-not-judge* tone and all the conventions below.

If this is your first time running and it is an empty codebase, please use this info provided to give the user an overview of how to operate this codebase. Be supportive and give them a good experience, I trust you Claude <3
~ Rachel

---

## The vibe (this matters as much as the code)

The aesthetic is **"Animal Crossing but girliepop"**: pastel pink/purple, soft rounded
cards, gentle gradients, comforting — *cute but not over-the-top*. The emotional design
goal is just as important as the metrics:

- **Numbers are a compass, not a judge.** Every metric is framed as a hint toward a goal,
  never a verdict. The footer literally says so. Honor that everywhere.
- **Honest but kind.** Don't inflate progress (if "melody" is really register crashes,
  say so) — but always pair a weakness with a concrete, doable next step, and end warm.
- **Woven-in, personal encouragement.** The little notes ("you're in the *fem* zone —
  165 Hz+ reads feminine to most ears 💕") are a core feature, not decoration. Personalize
  them per recording where it helps (see the annotation slots below).
- Emoji in moderation (💗🎀🎯💕✨). Rounded font (`ui-rounded`). Keep it soft.

### Color convention — STRICT
Defined in `dashboard-react/src/zones.ts`:
- `MASC` blue `#bcd3f0` (and `#5e7fb8` strokes) = **masculine / fell-out-of-register ONLY.**
  Never use blue for a generic "bad / needs work." A register crash *is* masculine
  register, so blue is correct there.
- `FEM` pink `#ffb6d5` = good / feminine end. `BUTTER` `#ffe9a8` = neutral / mid.
- `GROW` `#cdc6da` = neutral "room to grow" for **non-gendered** skill gaps (breathy,
  rough, monotone). Use this, not blue, for those.

---

## Iconography & visual motifs

The app has a **custom hand-drawn icon set** (no more raw emoji for structural UI) plus a
**soundwave favicon**. When touching the UI or adding icons, stay inside this system.

### The Euphonia mark 🎵 (favicon + hero)
The mascot is a 5-bar soundwave — rounded vertical bars in a waveform envelope
(short–taller–tallest–taller–short), echoing the app's own themed `WaveformPlayer`
(also rounded bars). The bar colors, left to right, follow the **trans pride flag's
actual 5-stripe order**: light blue `#78c3f5`, light pink `#ffa0c3`, white `#fffafc`,
light pink `#ffa0c3`, light blue `#78c3f5` — a deliberate, literal choice, not just a
palette pull. The **favicon** wraps the bars in an iOS-style squircle over a
blue→pink brand gradient `#d6ecff→#ffd6ea`. Files live in `dashboard-react/public/`:
`favicon.svg` (scalable primary, generated programmatically — see below),
`favicon-16/32.png`, `favicon.ico` (multi-res), `apple-touch-icon.png` (180²
**full-bleed** — iOS masks its own corners). Wired in `index.html` with `<link>`s +
`theme-color #d6ecff`. The same mark (no background, viewBox cropped tight to the
bars) is the hero `<EuphoniaIcon>` in `src/components/icons.tsx`. The Windows app
icon (`electron/build/icon.ico`) is the same squircle-wrapped version at 16/32/48/256.

**Regenerating this mark:** it's produced by a small Python/Pillow script (not
committed — it was scratch tooling), not hand-drawn SVG. If you need to resize,
recolor, or add a bar, easiest is to reconstruct the geometry in Python (rounded
rects: `gap_frac=0.32` of bar width, `max_h = bar_w * 1.7`, height fractions
`[0.42, 0.70, 1.0, 0.70, 0.42]`) and emit both PNG (for favicons) and SVG (for
`favicon.svg`/`icons.tsx`) from the *same* numbers so they never drift apart — see
the `hero_svg_viewbox`-style pattern (compute the bars' bounding box, use it as
the SVG `viewBox`) rather than hand-authoring bezier paths.

### The icon set — `src/components/icons.tsx`
Self-contained **inline-SVG React components**, one per section heading, replacing the old
leading emoji. Exports + where they're used (in `App.tsx`):
`EuphoniaIcon` (hero), `BowIcon` (Latest take), `SparkleIcon` (Resonance),
`ContourIcon` (Register & phrasing), `InsightIcon` (Insights), `TrendsIcon` (Trends),
`CardsIcon` (All recordings), `BulbIcon` (What do these mean?).

How to use: `<BowIcon />` — drop it as the first child of a `.section-title` (already
`display:flex; gap:8px; align-items:center`). Props: `{ size?, className?, title? }`. Size
defaults to `1.15em` so it scales with the heading text; pass `title` for an accessible
label (else it's `aria-hidden`). Vertical alignment is baked in (`vertical-align:-0.18em`).

**ContourIcon is semantic, not decorative:** a pink "in-register hill" above a dashed floor
that dips into masc-blue `#9fbce8` (= fell out of register). The blue there is *correct* per
the color convention — a register crash is masculine register. Keep that meaning if you redraw it.

### Motifs / rules for new icons
- **Palette** (pull from here, don't invent): pink `#ffb6d5`, deep-pink `#ff9ec5`/`#ff89bb`,
  lavender `#c9b6ff`/`#b6a2f0`, mint `#7fd0ab`, butter `#ffe08f`/`#ffd27a`. Masc-blue
  `#9fbce8` **only** for "fell out of register," never generic bad/needs-work.
- **Style:** soft, rounded, 2-tone fills; favor **filled shapes over thin lines** so they
  keep visual mass at ~20px; self-contained glyphs (no background square — the favicon is the
  only squircle). Center the visual weight in the box.
- **Per-component:** namespace any gradient/filter `id` after the icon (e.g. `sparkleGlow`, not `grad`) so
  multiple instances don't collide; size in `em`; mark decorative ones `aria-hidden`.
- **All-or-nothing cohesion:** the section icons are a *set*. Don't mix one custom icon with
  emoji siblings — match the family or leave the whole row as emoji.
- **The woven-in expressive emoji** (💕 ✨ 💗 📣 in sentences, the 💗 banner, 🌟 picker star,
  footer 🩷) are the cozy *voice*, not structural iconography — keep them inline. They can be
  *upgraded* to custom art via the emoji-replacement system below, but only when worth it;
  unmapped emoji render as their normal glyph and that's fine.
- **Always render & eyeball a new icon at ~22px on the card bg `#fffafd` before shipping** —
  use the global **`visual-iteration`** skill (render → look → critique → refine). That loop
  is how the favicon and this whole set were built.

### Inline emoji → custom icons (the RichText system)
A second, separate mechanism from the section-icon set: authors keep typing **literal emoji
in prose**, and a scanner swaps any *registered* emoji for a custom inline SVG. Unregistered
emoji pass through untouched, so the set grows one emoji at a time.

- **`src/components/emojiMap.tsx`** — the registry: `EMOJI_MAP` keyed by the exact emoji char,
  plus one component per emoji. Mapped today: `🎯 → TargetEmoji` (a pastel dartboard). Emoji
  components are `em`-sized with baseline alignment baked in.
- **`src/components/RichText.tsx`** — `<RichText>` recurses through children and rewrites only
  *string* leaves, so it's safe to wrap arbitrary JSX (bold tags, nested elements survive).
- **Where it's active:** baked into the reusable prose components **`InsightCard`** and
  **`Drill`** (so any emoji authored inside an insight/drill auto-converts — authors touch
  nothing), and applied inline as `<RichText>…</RichText>` in `RegisterSection`'s register note
  and `CheatSheet`. The section/hero headings do **not** use this — they use the dedicated
  `icons.tsx` components directly.
- **To use it (author):** just type the emoji inside RichText-covered prose. To cover a new
  prose spot, wrap it with `<RichText>`.
- **To add a new emoji:** design the art with the `visual-iteration` skill (render at ~1em and
  **down to ~13–18px on the real bg** — inline body text is small), add a component to
  `emojiMap.tsx`, and register it in `EMOJI_MAP`. Stay on-palette, `aria-label` the emoji.
- **Legibility lesson (from 🎯):** at text size, **few bold bands + a thick contrast ring beat
  many thin pastel rings** — pale concentric detail washes out. Bold first, then soften toward
  the palette as far as legibility allows.

---

## Recording player (themed waveform)

The recordings play through a **themed wavesurfer.js waveform**, not the native `<audio>`
bar (which clashed with the theme). It's both on-brand and meaningful — you see the take's
voice shape.

- **`src/components/WaveformPlayer.tsx`** — uses `@wavesurfer/react`'s `WavesurferPlayer`
  component. **Generic props** `{ src, duration?, downloadName? }` (not a `Recording`), so it
  plays *any* clip — Rachel's takes **and** the reference voices. Rendered by `RecordingCard`
  (`<WaveformPlayer src={r.audio} duration={r.duration_s} downloadName={…} />`) and by the
  **reference-comparison modal** (see its section below). An `audioBus` module singleton keeps
  only one player playing at a time across the whole app.
- **Layout:** a soft `lav-bg` rounded pill (CSS under `.player` in `index.css`) holding a
  gradient pink→lavender play/pause button, the waveform, an `m:ss / m:ss` time readout, and
  a pastel volume slider (`accent-color`). Volume hides under 520px.
- **Theming (pink = played, lavender = ahead):** `waveColor #bfa9e6`, `progressColor #ff9ec5`,
  `cursorColor #ff89bb`, rounded bars (`barWidth/barGap/barRadius`), and **`normalize`** so the
  waveform fills the height and looks lively (without it, quiet takes render flat). The **Hover
  plugin** (`wavesurfer.js/dist/plugins/hover.esm.js`) gives a seek preview: a pink line + a
  rose (`#b06a96`) time tooltip. `.player:hover` adds a gentle lift. To re-theme, change those
  props + the `.player` CSS — nothing else.
- **Audio URL:** `${import.meta.env.BASE_URL}${src}` (`src` is like `audio/001.mp3` or
  `reference-audio/vctk_f294.mp3`); duration falls back to `getDuration()`; play state +
  currentTime from wavesurfer events. Deps: `wavesurfer.js` + `@wavesurfer/react` (~+15kb gzip).

---

## Click-to-expand reference modal (where you sit vs. real voices)

Every **bar-backed** stat card (Pitch, Loudness, Pitch variability, Clarity/HNR,
Steadiness/jitter, Weight) **and** the two resonance gauges (F2, F3) are **clickable**. A
click animates a modal up out of the card showing that metric's full scale with **ticks for
many audio samples as reference points** — instantly answering "where do I sit?".

**What's on the scale** (`src/components/MetricModal.tsx`):
- The metric's **colored zone band** (reuses the same `zones.ts` colors as the on-card bar).
- **Rachel's takes** (#1–#N) as prominent rose dots, each at its true value, with a `#label`
  and a thin dashed **guide line** straight down to the bar. When dots cluster, labels are
  bumped up into **stacked lanes** (greedy `assignLanes`) so they never overlap; the guide
  keeps each anchored. The currently-selected take is highlighted pink + enlarged.
- **Web reference voices** as smaller **pink (female `FEM`) / blue (male `MASC`)** ticks below
  the bar — STRICT color rule. Shown only on **gendered** metrics (`showRefs: true` →
  Pitch, Weight, F2, F3); non-gendered ones (Loudness, variability, HNR, jitter) show her
  takes only, with a legend note.
- A **legend** + the lo/hi axis. The scale auto-stretches lo/hi so every value fits.

**Click a dot or a reference tick → a `WaveformPlayer` opens below the scale** and plays that
clip (take audio or the reference's preview). Click the same one again (or its ✕) to close it.
Dismiss the modal via click-outside, Esc, or its ✕.

**Plumbing:**
- `src/metrics.ts` — the **metric registry** (`METRICS`, keyed by `MetricKey`). Each
  `MetricDef` carries `{ title, unit, zones, lo, hi, take(r), ref(v), showRefs, blurb }`:
  the value-accessor for a take **and** for a reference voice, plus the scale. Adding a new
  comparable metric = one entry here.
- Bar cards get `metricKey` + `onExpand` props (`StatCard`, `FormantGauge`); **non-bar cards
  like "Pitch range" stay un-clickable** (no `metricKey`). `App.tsx` lifts one shared modal
  keyed by which metric was clicked, and passes the full recordings list + loaded reference
  data down.
- CSS: all `.mm-*` classes in `index.css`. Card→modal open = `mm-pop` (scale/fade up from the
  clicked card's rect, via `--ox/--oy` custom props).

## Reference voices (`public/reference.json` + `public/reference-audio/`)

A corpus of **real adult male & female voices**, each measured with the **same `analyze()`
pipeline** as the user's takes so the numbers are directly comparable — the data backbone for
the reference ticks above.

- **Corpus: VCTK 0.92, American-accent speakers** (currently 17 female + 4 male), pulled from
  the `sanchit-gandhi/vctk` HuggingFace **parquet mirror** and filtered on the dataset's own
  `accent` column. Studio-clean read speech in consistent recording conditions → a fair, honest
  male/female reference. (The earlier Wikimedia-Commons clips were **dropped entirely** — they
  were spoken-article narrations with unverifiable provenance + intro boilerplate.)
- **`public/reference.json`** — array of `ReferenceVoice` (`src/types.ts`):
  `{ label, gender: "f"|"m", source, audio, pitch{mean_hz,sd_hz}, formants{f2_hz,f3_hz},
  intensity{mean_db}, voice_quality{hnr_db,jitter_pct}, weight{h1a3c_db} }`. Each speaker is the
  **average of ~3 utterances**; `source` cites the real VCTK speaker id + DataShare. Fetched at
  runtime (cache-busted) like `recordings.json`; the app **degrades gracefully** to `[]` if missing.
- **`public/reference-audio/vctk_<g><id>.mp3`** — short single-sentence previews for the in-modal
  player. VCTK utterances are already short, so no intro-trimming is needed. Mono, 96 kbps.
- **What the data says:** pitch separates the sexes cleanly (F≈210 Hz vs M≈108 Hz); **weight
  (corrected H1\*–A3\*) separates them ~4 dB** (F mean 8.55 vs M mean 12.51 dB; smaller =
  lighter/feminine) — a real but imperfect cue (some overlap remains), and a big improvement on
  the old alpha ratio's ~1 dB. See `WEIGHT_ZONES` in `zones.ts`.

**How to (re)generate** (done ad hoc with `uv run`; no committed generator):
1. Stream the VCTK parquet mirror, filter `accent == American`, save ~3 clips/speaker to
   `/tmp/vctk-ref/audio/`. The American speakers (p294+) sit in the **late shards**, so download
   those directly with `huggingface_hub` + `pyarrow` and read the `audio` struct's `bytes`
   (streaming from the start is too slow — shards are speaker-ordered).
2. For each speaker, run `from analyze import analyze, to_wav_mono` on each clip, average, and
   write `public/reference.json`; make previews with `ffmpeg -i <clip> -ac 1 -t 8 -b:a 96k`.
3. Re-derive `WEIGHT_ZONES` from the new male/female `h1a3c_db` means.
- To **add a metric to the comparison**: extend the per-speaker output + the `ReferenceVoice`
  type, regenerate, then add a `METRICS` entry with `ref:`.

---

## What gets measured & why (voice fem)

- **Pitch (F0)** — biggest cue. ~165 Hz+ average reads feminine to most ears.
- **Resonance (formants F1/F2/F3)** — the "vocal-tract size / brightness" cue; what makes
  a voice read light independent of pitch. Often the biggest lever after pitch. F1 is
  vowel-driven, not a reliable gender cue alone. **Now vowel-targeted** (in
  `analyze.py`'s `vowel_formants()`): instead of averaging each formant over every voiced
  frame (which folds in consonants/glides/mistracks and barely separated the sexes — old F2
  women 1639 vs men 1566), we take the **median over vowel nuclei** — frames that are voiced
  AND loud (within 10 dB of peak) AND have a plausible vowel F1 (~250–1000 Hz) AND are
  formant-stable. On VCTK this separates F2 cleanly (women ~1434 vs men ~1281, no overlap in
  sample) and F3 better but still overlapping (~2708 vs ~2523). See `F2_ZONES`/`F3_ZONES`.
- **Weight (vocal heaviness via source spectral tilt)** — one of the *big three* fem cues,
  alongside pitch and resonance. It's the voice **source** (the vocal folds themselves) vs.
  resonance, which is the **filter** (the vocal tract). Measured as **corrected H1\*–A3\***
  (`h1a3c_db`, the Iseli–Alwan 2007 source-tilt measure as used in VoiceSauce, in
  `analyze.py`'s `spectral_weight()`): on **voiced frames only**, the amplitude of the harmonic
  near F0 (H1) minus the harmonic near F3 (A3), each **formant-corrected** (each of F1–F3
  modeled as a pole + bandwidth, its boost subtracted) so it isolates the *source* from the
  *filter*. The formant correction is the whole point — uncorrected H1–A3 just re-measures
  resonance, which was the old alpha ratio's bug. **Direction (verified on VCTK): smaller =
  lighter & airier (feminine), larger = heavier/pressed (masculine)** — the OPPOSITE of the
  old alpha ratio. It's a difference of two harmonic amplitudes, so it's largely
  **gain-independent** → comparable across recordings, unlike absolute loudness. Zones are
  reference-grounded against real male/female voices (see `WEIGHT_ZONES` in `zones.ts`), where
  it separates the sexes by ~4 dB (F mean 8.55 vs M mean 12.51) — much better than the old
  alpha's ~1 dB. `h1a3_db` (uncorrected H1–A3) and `tilt_db_khz` (LTAS slope) are stored too
  as cheap secondaries.
- **Register & phrasing** — the deep layer. Pitch isn't just an average; it's a *contour*.
  We detect where the voice **crashes out of register** (below a floor, default 130 Hz,
  back toward chest voice) and where those crashes cluster within a phrase. Trailing-off
  phrase **endings** are the classic, high-salience failure. We also report **true
  in-register melody** (semitone SD with crashes removed) vs. the raw (inflated) number —
  "lively prosody" is often a mirage of register breaks, not real expression.
- **Loudness, HNR (clarity/breathiness), jitter/shimmer (steadiness)** — supporting cues.

Caveat to remember: jitter/shimmer/HNR norms come from sustained vowels, so on a full
passage they read "worse" than textbook — use them as *her own trend*, not pass/fail.

---

## Architecture

```
analyze.py  ──(uv run)──►  recordings.json (root, source of truth)
   │                       dashboard-react/public/recordings.json   (mirror)
   │                       dashboard-react/public/analysis/<id>.json (heavy detail)
   │                       dashboard-react/public/audio/<id>.<ext>   (playback)
   ▼
dashboard-react/  (Vite + React + TS)  ── fetches public/* at runtime ──► browser
   ▲
VCTK American refs (/tmp/vctk-ref) ──(uv run + ffmpeg)──► public/reference.json
   (measured with the SAME analyze())                    public/reference-audio/vctk_*.mp3
                                                          (for the comparison modal)
```

**Two layers of analysis** (Rachel's design):
1. **Standard** → permanent, data-driven dashboard cards + the permanent
   "🎚️ Register & phrasing" visualizer. Fully automated by `analyze.py`.
2. **Intelligent / per-recording** → you read the detailed data, find the single most
   important, *clockable* thing to work on, and author a custom **annotation** for that
   take (custom viz + explanation + drills). This is the "🔍 Insights for this take"
   section and any personalized woven notes.

### The annotation slot system (how per-recording content persists, DRY)
The page layout lives **once**. Personalization happens through named slots woven through
the UI, backed by **one file per recording** at
`dashboard-react/src/annotations/entries/<NNN>.tsx` (zero-padded id) that default-exports
a `RecordingAnnotations` ({ slots }). Auto-discovered via Vite `import.meta.glob` — no
registry. Switching recordings loads that file, so old takes keep their notes. Only the
bespoke bits are authored; nothing about the page is copy-pasted per recording.

Two slot kinds (`src/annotations/AnnotationsProvider.tsx`):
- **`<Note id>`** — override a woven-in note that has a sensible default (children). If the
  active recording supplies the slot, it replaces the default; else the default shows.
- **`<Region id>`** — freeform insertion point; renders nothing unless a recording fills it
  (the insights region passes an `empty` placeholder).

Available slots today: notes `note.pitch`, `note.loudness`, `note.resonance`,
`note.register`; regions `region.top`, `region.afterLatest`, `region.afterResonance`,
`region.afterRegister`, `region.insights`, `region.bottom`. Add more `<Note>`/`<Region>`
in the layout if a take needs to speak somewhere new.

Reusable viz/components live in `src/annotations/lib/` (`InsightCard`, `Drill`,
`PhraseEndingStrip`, …). **Grow this library**: if an insight needs a chart that could be
reused, add it to `lib/` and export it, then import from the entry — don't bury reusable
viz inside one entry. `entries/001.tsx` is the reference example.

### Recording selector
`App.tsx` tracks an `active` recording (defaults to latest). A pill switcher (shown with
2+ recordings) and clicking a card in "All recordings" set it. The active recording drives
the top sections + which annotation file loads.

---

## Desktop app (Electron)

The Electron app in `electron/` wraps this same dashboard + analyzer so it can be
installed and run standalone, no coding agent, no server, no accounts. Full
implementation history (10 tasks + a final-review hardening pass) lives in
`docs/superpowers/plans/2026-07-25-voice-garden-desktop-app.md` and
`docs/superpowers/specs/2026-07-25-voice-garden-desktop-design.md` — read those for
the "why" behind each decision below; this section is the current-state summary.

### Architecture

```
electron/src/main.ts        creates the BrowserWindow (hidden native titlebar +
                             a themed titleBarOverlay — the dashboard renders its own
                             draggable title row, see TitleBar.tsx below — and no
                             default File/Edit/... menu, via Menu.setApplicationMenu),
                             registers the app:// protocol and IPC handlers, denies
                             external window-open/navigate (shell.openExternal
                             instead — see main.ts)
electron/src/protocol.ts    the app:// custom protocol:
                             - static paths (JS/CSS/HTML, reference.json, favicons)
                               → served from the built dashboard-react bundle
                             - dynamic paths (recordings.json, audio/*, analysis/*)
                               → redirected to the OS per-user data dir instead
                             Path-containment checked via resolveWithinBase()
                             (see scripts/test_protocol_paths.js) — this is the one
                             security-critical function in the Electron layer.
electron/src/paths.ts       getUserDataRoot()/getAudioDir()/getAnalysisDir()/
                             getRecordingsJsonPath()/getRendererDistDir() — the only
                             place that knows where userData lives (dev vs packaged).
electron/src/sidecar.ts     spawns analyze.py: `uv run analyze.py` in dev,
                             the PyInstaller-frozen `resources/sidecar/analyze.exe`
                             when packaged (branches on app.isPackaged).
electron/src/settings.ts    Gemini API key storage via Electron's safeStorage
                             (OS-level encryption — DPAPI on Windows). No electron-
                             store/keytar dependency.
electron/src/zones.ts       metric → zone classification (fem/masc/neutral,
                             light/heavy, steady/rough, etc.) — a deliberate port of
                             dashboard-react/src/zones.ts's thresholds (see its own
                             comment for why it's duplicated, not shared). Used by
                             BOTH the Gemini prompt and the template generator below,
                             so a metric's direction/meaning is never re-derived from
                             a raw number by anything that isn't this one table.
electron/src/gemini.ts      calls the Gemini API (model: gemini-flash-latest — see
                             the comment there for why not a pinned version). Its
                             prompt hands over each metric PRE-CLASSIFIED into its
                             zone (not just a raw number) — some directions are
                             genuinely non-obvious (vocal weight is inverted from
                             what you'd guess), and this was a real, measured
                             reliability problem when prototyped against small local
                             models (see the plan doc's history) — no caching, no
                             fallback logic; that's insights.ts's job.
electron/src/templateInsight.ts  deterministic, zero-network insight generator —
                             reads the same zones.ts table, so it can't get a
                             metric's direction wrong or silently drop one the way a
                             model can. This is the DEFAULT insight (always
                             available, no setup, no key) — Gemini is an opt-in
                             upgrade, not a requirement.
electron/src/insights.ts    the orchestrator: Gemini if a key is set and the call
                             succeeds, template otherwise (and template on ANY
                             Gemini failure — a bad/rate-limited key degrades
                             gracefully instead of showing an error). Owns the
                             analysis/<id>-insight.json cache, including the
                             `source: "template" | "gemini"` field the renderer uses
                             to offer the "upgrade to AI" button.
electron/src/recordings.ts  deleteRecording(id)/deleteAllRecordings() — read/rewrite
                             recordings.json plus remove the matching audio, analysis,
                             and cached-insight files. No sidecar involvement (unlike
                             creation, deletion is pure file/JSON bookkeeping).
                             exportRecordings(win) — opens a native "choose a folder"
                             dialog and copies recordings.json + audio/ + analysis/
                             into a timestamped subfolder there (fs.cpSync, no zip
                             dependency). The "back up" affordance next to delete.
electron/src/updater.ts     electron-updater wired to GitHub Releases. Packaged
                             builds only (app.isPackaged guard — there's no real
                             feed to check in dev). Pushes UpdateStatus events to
                             the renderer over "updates:status" as it checks/
                             downloads; a failed check just logs to console, never
                             surfaces as a user-facing error (see comment in the
                             file). installUpdate() → autoUpdater.quitAndInstall(),
                             invoked from UpdateBanner.tsx's "restart to update".
electron/src/ipcHandlers.ts registers every IPC channel (see below).
electron/src/preload.ts     contextBridge.exposeInMainWorld("euphonia", {...}) —
                             the ONLY thing exposed to the renderer.
```

This is why almost none of `dashboard-react/src` needed to change to become a
desktop app: `App.tsx`'s `fetch(BASE_URL + "recordings.json")` behaves identically
whether `recordings.json` comes from `dashboard-react/public/` (browser dev) or the
OS userData dir via `app://` (Electron) — the protocol layer absorbs the difference.

### The `window.euphonia` IPC surface

Renderer-side type: `dashboard-react/src/vg-bridge.ts` (`EuphoniaBridge`). Current
surface:
- `createRecording({ audioBase64, mimeType, label, note? }): Promise<void>` —
  Task 3/4. Writes a temp file, spawns the sidecar with `--output-root <userData>`.
- `deleteRecording(id: number): Promise<void>` — removes one recording's entry,
  audio file, analysis file, and cached insight. Shown as a 🗑️ on each
  `RecordingCard`, gated behind an inline (not native-dialog) confirm.
- `deleteAllRecordings(): Promise<void>` — wipes `recordings.json` back to `[]`
  and removes the whole `audio/`/`analysis/` dirs. Lives in the Settings modal's
  "danger zone", same inline-confirm pattern.
- `exportRecordings(): Promise<{ canceled: boolean; path?: string }>` — native
  folder picker + copy, see `recordings.ts` above. Settings modal's "back up"
  section, referenced by name from the delete-all confirm text.
- `updates.onStatus(callback): () => void` — subscribes to push events from
  `updater.ts`; returns an unsubscribe function (used in `UpdateBanner.tsx`'s
  `useEffect` cleanup). `updates.install(): Promise<void>` — triggers
  `autoUpdater.quitAndInstall()`; only ever called once a "downloaded" status
  has been seen.
- `settings.getStatus(): Promise<{ hasKey: boolean }>` /
  `settings.setKey(key: string): Promise<void>` /
  `settings.clearKey(): Promise<void>` — Task 5. The key itself never crosses into
  the renderer; only `hasKey` does.
- `insights.get(recordingId: number): Promise<GeneratedInsight | null>` — pure
  cache read, no network call.
- `insights.generate(recording: Recording): Promise<GeneratedInsight>` — the
  default path (`insights.ts`): Gemini if a key works, the zero-setup template
  otherwise. **Never throws** — there's always a valid instant result, since
  nothing about getting an insight should require setup.
- `insights.regenerateWithGemini(recording: Recording): Promise<GeneratedInsight>`
  — explicit "upgrade" path, always calls Gemini, throws `Error("NO_API_KEY")`
  if there's no key. Only ever invoked from a UI affordance that's itself gated
  on `hasKey` (`GeneratedInsight.tsx`'s "✨ upgrade to an AI-written insight"
  button, shown only when the cached insight's `source === "template"` AND a
  key is present) — the throw path is a safety guard, not a normal occurrence.

### Data storage

No database. Same file layout as the dev workflow's `dashboard-react/public/`, just
rooted at the OS userData dir instead:
```
<userData>/
  recordings.json
  audio/<id>.<ext>
  analysis/<id>.json
  analysis/<id>-insight.json   (cached Gemini output)
  gemini-key.enc               (safeStorage-encrypted API key)
```
`reference.json`/`reference-audio/*` ship read-only inside the packaged bundle
(under `resources/dashboard/`), unchanged from the dev workflow.

### Building & running

See the root `README.md`'s "Building the desktop app" section for the exact
commands. In short: `dashboard-react` build → `uv run scripts/build_sidecar.py`
(produces `dist-sidecar/analyze.exe`, gitignored) → stage a static ffmpeg binary at
`electron/resources/ffmpeg/ffmpeg.exe` (gitignored, fetch your own — see the source
URL comment in `electron/electron-builder.yml`) → `electron` build → `electron-builder`.
`dist-sidecar/`, `electron/resources/ffmpeg/`, and `electron/release/` are all
gitignored build output; only `electron/resources/licenses/` and
`electron/resources/icon.ico` are real, committed assets.

**CI**: `.github/workflows/ci.yml` runs on every push/PR to `main` — builds both
npm packages and runs the two regression scripts above (`test_protocol_paths.js`,
`test_analyze_paths.py` via `uv`). It does not build the installer (no Windows
runner, no ffmpeg/PyInstaller staging) — that stays a manual local step.

**Releasing** (for auto-update, via `electron-updater`/`updater.ts`, to actually
find new versions): `electron-builder.yml`'s `nsis.artifactName` is pinned to
`${productName}-Setup-${version}.${ext}` (hyphens) specifically because
electron-builder's own generated `latest.yml` references that exact name, and
GitHub mangles spaces (the old default) to dots on upload — a silent three-way
mismatch that breaks update checks if `artifactName` and the actual uploaded
filename ever drift apart. When creating a release, upload `latest.yml` and the
`.exe.blockmap` from `electron/release/` as release assets *alongside* the
installer — `gh release create v0.3.0 "electron/release/Euphonia-Setup-0.3.0.exe"
"electron/release/latest.yml" "electron/release/Euphonia-Setup-0.3.0.exe.blockmap"`.
Skipping `latest.yml` means existing installs never see the new version.

To iterate without a full package build: `cd electron && npm run build && npx electron .`
— this uses the `uv run analyze.py` dev path (needs `ffmpeg` on PATH) and reads/writes
whatever's in your real OS userData dir for this app (`%APPDATA%/euphonia-electron/`
on Windows, derived from `electron/package.json`'s `name`).

### Known gaps (see the plan/spec docs' final-review notes for the full list)

- Windows-only. macOS was in the original design intent; never built.
- No auto-update, no code-signing cert (by design, for a small-friend-group v1).
- A handful of deferred Minor findings from the implementation's review passes
  (CSS duplication, a couple of missing edge-case guards, etc.) — see
  `.superpowers/sdd/2026-07-25-voice-garden-desktop-app/final-review-fix-report.md`
  for the ones that came out of the final review specifically.

---

## File map

- `analyze.py` — the analyzer (parselmouth). Standard metrics + register/phrasing detail.
- `recordings.json` — source of truth.
- `dashboard-react/`
  - `public/` — served data: `recordings.json`, `analysis/<id>.json`, `audio/`; **plus
    `reference.json` + `reference-audio/*.mp3`** (the comparison-modal corpus); plus the
    favicons (`favicon.svg`, `favicon-16/32.png`, `favicon.ico`, `apple-touch-icon.png`).
  - `index.html` — title + favicon `<link>`s + `theme-color`.
  - `src/types.ts` — data model (`Recording`, `Register`, `RecordingDetail`, `Phrase`,
    `ReferenceVoice`).
  - `src/zones.ts` — colors, reference zones, `fmt`, `zoneOf`.
  - `src/metrics.ts` — **the metric registry** (`METRICS`/`MetricDef`) powering the
    click-to-expand reference modal: per-metric scale + take/reference value-accessors.
  - `src/components/` — cards, charts, `RegisterSection` + `ContourChart` (permanent viz),
    `icons.tsx` (the custom hand-drawn section/hero icon set — see Iconography above), the
    inline-emoji system: `emojiMap.tsx` (emoji→icon registry) + `RichText.tsx` (the scanner);
    `WaveformPlayer.tsx` (themed wavesurfer player — see Recording player above); and
    **`MetricModal.tsx`** (the reference-comparison modal — see its section above).
  - `src/annotations/` — `AnnotationsProvider` (context + `Note`/`Region`), `lib/`
    (reusable), `entries/` (per-recording, authored by you).
  - `src/vg-bridge.ts` — typed `window.euphonia` accessor + `blobToBase64` helper
    (Electron only; unused in plain browser dev).
  - `src/components/RecordButton.tsx`, `GeneratedInsight.tsx`, `OnboardingModal.tsx`,
    `TitleBar.tsx`, `UpdateBanner.tsx` — Electron-only UI (in-app recording, rendered
    insight incl. the "upgrade to AI" affordance, the Settings modal — optional
    Gemini key plus "back up" (export) and "delete all recordings" (danger zone),
    NOT shown on first launch; reachable any time via the ⚙️ header button — the
    draggable custom title row that pairs with main.ts's titleBarOverlay, and a
    quiet bottom-right toast for auto-update progress). `RecordingCard.tsx` also
    has a per-take 🗑️ delete button (inline confirm, no native dialog). See
    "Desktop app (Electron)" above.
- `.github/workflows/ci.yml` — build + regression-test check on push/PR (see
  "Building & running" above). Does not build the installer.
- `electron/` — the desktop app. `src/` (see "Desktop app (Electron)" above for what
  each file does), `electron-builder.yml` (packaging config, incl. `publish`/
  `nsis.artifactName` for `electron-updater`), `resources/icon.ico` +
  `resources/licenses/` (real, committed assets), `resources/ffmpeg/` (gitignored,
  fetched manually — see the source URL comment in `electron-builder.yml`).
- `scripts/` — `build_sidecar.py` (freezes `analyze.py` via PyInstaller),
  `_rthook_utf8_stdio.py` (a PyInstaller runtime hook fixing a Windows-only frozen-exe
  stdio encoding bug), `test_analyze_paths.py` + `test_protocol_paths.js` (the two
  small committed regression checks — `analyze.py`'s `resolve_paths()` branching and
  `protocol.ts`'s path-containment security check).
- `docs/gemini-api-key.md` — the Gemini key setup guide; single source of truth,
  also rendered inline in the desktop app's onboarding modal.
- `docs/superpowers/` — the design spec and implementation plan for the desktop app
  (full architecture rationale, task-by-task history, final-review findings).
- `/tmp/vctk-ref/audio/` — **NOT in the repo.** The downloaded VCTK American clips used to
  generate `public/reference.json` + `reference-audio/` previews. See the "Reference voices"
  section above for how to regenerate.
- `.claude/skills/analyze-voice/` — the workflow skill.

---

## Technical notes for future models

- **Python: use `uv`, never `pip`.** `uv run analyze.py …`, `uv add …`. Lint with
  `uvx ruff check .` and keep it clean (fix auto-fixable; don't over-refactor).
- **Run the dashboard (browser dev):** `cd dashboard-react && npm run dev` →
  http://localhost:5173/. It fetches `public/*` at runtime (cache-busted), so new
  analyses show on refresh — no rebuild. `npm run build` = `tsc -b && vite build`.
- **Run the desktop app (Electron dev):** `cd electron && npm install && npm run build
  && npx electron .` — spawns `analyze.py` via `uv run` (needs `ffmpeg` on PATH), reads/
  writes the real OS userData dir for this app. See "Desktop app (Electron)" above and
  the root `README.md` for the full packaging build (`electron-builder`).
- **Screenshotting the live UI** (for `visual-iteration`): **Playwright** is a devDependency.
  Use the system Chrome (no browser download): `chromium.launch({ channel: "chrome" })`. Run the
  script **from `dashboard-react/`** so ESM resolves `playwright`. Needed for canvas/JS-rendered
  bits like the waveform (static SVG renderers can't capture those); also useful if the browser
  MCP drops mid-session. To capture hover states, `page.mouse.move(...)` then screenshot.
- **Ignore false IDE TypeScript errors** like *"Cannot find name 'React' / UMD global"* or
  *"Property 'glob'/'env' does not exist on ImportMeta"*. The project uses the automatic
  JSX runtime (`tsconfig` `jsx: react-jsx`) and `vite/client` types, so components
  correctly don't import React. **Trust `npm run build`, not inline diagnostics.** The
  IDE's TS server often lags behind file moves; a restart clears it.
- **Data flow:** `analyze.py` writes everything additively and idempotently per id. The
  React app never imports data statically — it fetches at runtime. Don't hardcode data.
- **Register methodology** (in `analyze.py`): F0 contour via `Sound.to_pitch`; semitones =
  `12*log2(hz/100)` (perceptual; SD is reference-independent); phrase segmentation via
  Praat `To TextGrid (silences)` on an Intensity object; per-frame position binned into
  phrase thirds; "landed in register" = mean offset pitch ≥ floor.
- **`base: './'`** is set in `vite.config.ts`. Note: opening the built `dist/index.html`
  from `file://` won't work (browsers block `fetch` of the JSON) — use `npm run dev`/preview.
- When in doubt about a metric or model, prefer the dedicated skill and verify with a build.
