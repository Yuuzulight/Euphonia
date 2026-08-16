# Euphonia Theme System — Design

## Goal

Give Euphonia a set of switchable color themes, including several dark ones,
so the app is comfortable to use in a dim room at night as well as in
daylight. The choice is remembered per device and applies identically to the
browser version and the desktop app, which share one UI codebase.

## Non-goals (explicitly out of scope)

- No user accounts or profiles. "Remembered per user" means per device, the
  same way recordings already work.
- No theme sync between the browser version and the desktop app, or between
  devices. There is no server to sync through.
- No high-contrast accessibility theme. It belongs in this list eventually,
  but it needs to override the data colors rather than respect them (see
  "Token model"), so it gets its own piece of work rather than riding along
  with a color sweep.
- No theme in the recordings export. That export is voice data meant to be
  archived and moved; a color preference is not part of it.
- No new test framework.

## The eight themes

Three light, five dark:

| Theme       | Family | Character                                       |
| ----------- | ------ | ----------------------------------------------- |
| blossom     | light  | Today's pink/lavender look, unchanged. Default. |
| paper       | light  | Warm oat-cream. Lowest glare of the light set.  |
| light mint  | light  | Sage-mint chrome, green-slate text.             |
| dusk plum   | dark   | Plum-tinted neutrals — dark, still Euphonia.    |
| dark mint   | dark   | Cooler green-slate sibling to dusk plum.        |
| midnight    | dark   | Deep indigo. The conventional calm dark.        |
| cocoa       | dark   | Warm brown. Coziest, furthest from data hues.   |
| amber night | dark   | Very warm, minimal blue light. For late use.    |

Approved palettes are the mockups in `2026-08-16-theme-mockups/`. Those files
are the reference for the exact colors; implementation transcribes them into
tokens rather than re-inventing values.

## Token model

The current CSS has 13 variables and roughly 150 hardcoded colors alongside
them. Everything becomes a token, in two groups that behave differently.

**Chrome tokens — vary freely per theme.** Surfaces (`--bg` gradient stack,
`--card`, `--line`, `--shadow`), text (`--ink`, `--ink-soft`), accents
(`--accent`, `--accent-2`, the button gradient), states (`--danger`,
`--success`), and `--on-zone` for text sitting on a zone-colored pill.

**Data tokens — fixed meaning, tuned per theme.** `--zone-masc`,
`--zone-fem`, `--zone-neutral`, `--zone-grow`, and the three loudness bands
`--zone-soft`, `--zone-comfy`, `--zone-strong`. These
encode meaning, not decoration: `zones.ts` documents a strict convention
where blue marks the masculine/deeper end and nothing else, pink the
feminine end, butter the mid, and a muted lilac "room to grow" on skill
metrics. Each theme gets a legibility-adjusted variant — same hue family,
lifted or desaturated to read against that theme's cards — but the mapping
from color to meaning never changes.

Consequence, accepted deliberately: in the mint themes the chrome goes mint
while the charts stay pink/blue/butter. Recoloring them would break the
convention the analysis rests on.

Two themes need their data tokens tuned harder than the rest:

- **midnight** — navy chrome sits nearest the masculine blue. The chrome goes
  deeper and the data blue brighter so they stay distinct.
- **amber night** — the warm cast mutes blue. Its data blue is cooled to
  claw back the separation.

Themes are selected by a `data-theme` attribute on `<html>`; each theme is
one block of token values under `:root[data-theme="…"]`.

## Theme state and persistence

The stored preference has three parts, kept as one JSON value in
`localStorage`:

```
{ mode: "light" | "dark" | "auto", light: <theme id>, dark: <theme id> }
```

`light` and `dark` are the user's favorite in each family. `auto` follows the
OS and swaps between exactly those two. Defaults are `auto`, blossom, dusk
plum, which means an existing user on a light OS sees no change at all.

`localStorage` rather than IndexedDB specifically because it reads
synchronously: a small inline script in `index.html` applies the theme before
first paint. Reading from IndexedDB would flash white on every load, which is
the one thing a dark theme must not do.

The renderer owns this value in both builds. Nothing is written to disk in
the browser version beyond that key.

## Desktop startup path

The Electron window's background color and native title-bar buttons are set
in the main process (`electron/src/main.ts`) before the renderer exists, so
main cannot ask the page which theme to use. Left alone, launching in a dark
theme shows a white frame and pink title bar until the UI catches up.

- On change, the renderer sends the resolved theme to main over IPC. Main
  calls `setTitleBarOverlay` to repaint live, and writes a small `theme.json`
  next to `recordings.json` in `userData`.
- On launch, main reads `theme.json` before creating the window and sets
  `backgroundColor` and the overlay from it.
- If that file is missing or unreadable, main falls back to Electron's
  `nativeTheme` and the renderer corrects it a moment later. The file is a
  disposable cache, never the source of truth.

## Colors that live in JavaScript

CSS variables do not reach these, so they route through a `useThemeColors()`
hook that reads the resolved token values once per theme change and supplies
them via context. Components receive plain strings and never touch the DOM
themselves.

- **`WaveformPlayer.tsx`** — wavesurfer.js takes wave, progress and cursor
  colors as options, plus the region overlay's line and label colors. On a
  theme change it calls `setOptions()` rather than rebuilding, so playback
  position survives the switch.
- **Charts** — `LineChart`, `ContourChart`, `FormantGauge`, `ZoneBar`,
  `MelodyArc`, `PhraseEndingStrip`, `StatCompare` are React-rendered SVG and
  re-render normally once their colors come from the hook.
- **`icons.tsx`** — the largest cluster at 54 colors. Decorative marks switch
  to `currentColor` and inherit surrounding text color; genuinely multi-color
  brand art gets explicit tokens.
- **`zones.ts`** — `MASC` / `FEM` / `BUTTER` / `GROW` resolve through the
  hook instead of being literal hex. This is what gives each theme its tuned
  variant while the documented convention stays true.
- **`emojiMap.tsx`**, and the pill text color currently hardcoded in
  `StatCard.tsx`, become tokens.

`electron/src/zones.ts` is untouched. It is a deliberate duplicate of the
thresholds for Gemini prompting and carries no colors at all.

## The picker

**Header button**, beside ⚙️ in `App.tsx`. Shows the theme it would switch
*to*. One click flips between the user's chosen light and dark favorites; it
never cycles through all eight. From `auto`, clicking commits to an explicit
mode opposite whatever is currently showing.

**Settings.** ⚙️ currently opens `OnboardingModal`, titled "💗 Gemini key
(optional)", which has been doubling as the settings screen. It gets retitled
to "⚙️ Settings" with the Gemini key demoted to one section among several,
and an appearance section added at the top: a Light / Dark / Auto control,
then two labeled swatch groups for the light and dark families. Each swatch
previews that theme's background, card and accent.

Choosing a swatch sets the favorite for its family and applies immediately if
that family is the one currently showing. The groups are radio groups, so
keyboard and screen-reader navigation work without extra handling.

## Verification

This project has no test runner — two hand-rolled assertion scripts in
`scripts/` and a `playwright` devDependency nothing currently uses. The plan
follows that existing pattern instead of introducing a framework.

- **`scripts/test_theme_tokens.js`** (new, plain node, matching
  `test_protocol_paths.js`) asserts that all eight theme blocks define
  exactly the same token set — this catches a theme silently missing a token,
  which otherwise surfaces as invisible text on a screen nobody opened. It
  also computes WCAG contrast for every text-on-surface pairing in all eight
  themes and fails below 4.5:1 for body text and 3:1 for large text.
- **Playwright screenshot sweep** across eight themes × dashboard, metric
  modal, settings and recordings list. Generated for review, not asserted;
  it is how a card that stayed white gets found.
- **Builds** — `tsc -b && vite build` in `dashboard-react`, `tsc -b` in
  `electron`.
- **Manual, and unavoidably so** — launching the desktop app to confirm the
  native title bar repaints and there is no white flash at startup. The
  unpackaged `npx electron .` path covers it if ffmpeg is on PATH; the
  packaged installer needs the ffmpeg staging step from the README.

## Risks

- **Eight themes multiply verification, not implementation.** Defining a
  palette is cheap; checking every modal, chart and the desktop title bar in
  each one is not. The token-parity check exists specifically to make most of
  that mechanical.
- **The tokenization sweep touches nearly every styled file.** It is wide but
  shallow, and mostly mechanical. Visual regressions in blossom are the thing
  to watch, since that theme must come out pixel-identical to today.
- **`OnboardingModal` gains a second responsibility.** It is already doing
  two jobs; adding appearance settings makes a case for splitting onboarding
  from settings. Out of scope here, worth revisiting if it grows again.
