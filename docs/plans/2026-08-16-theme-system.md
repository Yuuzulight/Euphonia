# Theme System Implementation Plan

> Steps use checkbox (`- [ ]`) syntax so the plan can be worked through task-by-task.

**Goal:** Ship eight switchable color themes (three light, five dark) across the browser and desktop builds, remembered per device, with no white flash on load in either.

**Architecture:** Every color in the app becomes a CSS custom property under `:root[data-theme="<id>"]`. Colors that live in JavaScript (wavesurfer, the zone constants) read those same properties at runtime through one `useThemeColors()` hook, so CSS stays the single source of truth. The renderer owns the stored preference; Electron's main process keeps a disposable cache of it purely so it can paint the window frame correctly before the renderer exists.

**Tech Stack:** Plain CSS custom properties (no CSS-in-JS, no new dependencies), React context, `localStorage`, Electron IPC + `setTitleBarOverlay`, plain-node assertion scripts matching `scripts/test_protocol_paths.js`, and the existing unused `playwright` devDependency for screenshots.

**Spec:** `docs/specs/2026-08-16-theme-system-design.md`

## Global Constraints

- **No new runtime dependencies.** Chrome/Electron built-ins and what's already in `package.json` only.
- **No test framework.** New tests are plain node scripts run directly, matching `scripts/test_protocol_paths.js`.
- **Blossom must render pixel-identically to today.** It is the default; any visual change to it is a regression, not an improvement.
- **The color convention in `zones.ts` is law.** Blue = masculine/deeper end ONLY, never a generic "bad". Pink = feminine/good end. Butter = neutral/mid. GROW lilac = "room to grow" on skill metrics, never blue. Themes may adjust these for legibility; they may never reassign which color means what.
- **The eight theme ids are exactly:** `blossom`, `paper`, `light-mint` (light family) and `dusk-plum`, `dark-mint`, `midnight`, `cocoa`, `amber-night` (dark family).
- **Approved palette source:** `docs/specs/2026-08-16-theme-mockups/*.html`. Transcribe those values; do not invent new ones.
- **No bare `React` import** (automatic JSX runtime), per existing repo convention.
- **Copy style:** warm and specific, lowercase UI labels, *compass not judge*.

---

## File Structure

**Created:**
- `dashboard-react/src/theme/themeStore.ts` — the stored preference: load, save, resolve, apply. No React.
- `dashboard-react/src/theme/ThemeProvider.tsx` — React context, the `useTheme()` and `useThemeColors()` hooks.
- `dashboard-react/src/theme/themes.ts` — the theme id lists and display names shared by the picker.
- `dashboard-react/src/components/ThemeToggle.tsx` — the header sun/moon button.
- `dashboard-react/src/components/ThemePicker.tsx` — the mode control + swatch groups for Settings.
- `electron/src/theme.ts` — main-process theme cache and the window-chrome color map.
- `scripts/test_theme_tokens.js` — token parity + WCAG contrast + cross-file theme-id parity.
- `scripts/screenshot_themes.mjs` — Playwright sweep.

**Modified:**
- `dashboard-react/src/index.css` — the token definitions and the whole sweep.
- `dashboard-react/index.html` — pre-paint inline script.
- `dashboard-react/src/main.tsx` — mount `ThemeProvider`.
- `dashboard-react/src/App.tsx` — header button.
- `dashboard-react/src/zones.ts` — zone colors resolve through the hook.
- `dashboard-react/src/components/WaveformPlayer.tsx`, `icons.tsx`, `emojiMap.tsx`, `StatCard.tsx`, `ZoneBar.tsx`, `LineChart.tsx`, `ContourChart.tsx`, `FormantGauge.tsx`, `RegisterSection.tsx`, `OnboardingModal.tsx`
- `dashboard-react/src/annotations/lib/MelodyArc.tsx`, `PhraseEndingStrip.tsx`, `StatCompare.tsx`
- `electron/src/main.ts`, `preload.ts`, `ipcHandlers.ts`, `vg-bridge.ts`
- `.github/workflows/ci.yml` — run the new token test.

---

## Task 1: Token parity and contrast checker

Build the safety net before the sweep, so every later task is verified as it lands.

**Files:**
- Create: `scripts/test_theme_tokens.js`
- Create (temporary fixture, deleted in Step 6): `scripts/__fixture-bad.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `node scripts/test_theme_tokens.js` — exits 0 on success, 1 with a printed reason on failure. Later tasks rely on it as their verification step.

- [ ] **Step 1: Write the failing test fixture**

Create `scripts/__fixture-bad.css` — two themes where the second is missing `--ink-soft` and has an unreadable text/card pair:

```css
:root {
  --bg-base: #fff0f7;
  --card: #fffafd;
  --ink: #6b5876;
  --ink-soft: #9d8ba8;
}
:root[data-theme="broken"] {
  --bg-base: #101010;
  --card: #181818;
  --ink: #1a1a1a;
}
```

- [ ] **Step 2: Write the checker**

Create `scripts/test_theme_tokens.js`:

```js
// Verifies the theme token blocks in dashboard-react/src/index.css:
//   1. every theme declares exactly the same token names as :root
//   2. every text-on-surface pair clears its WCAG contrast floor
//   3. the theme ids match electron/src/theme.ts (once that file exists)
// Plain node, no framework — same style as test_protocol_paths.js.
const fs = require("node:fs");
const path = require("node:path");

const BODY_MIN = 4.5;
const LARGE_MIN = 3.0;

// [foreground token, background token, floor] — checked in every theme.
const CONTRAST_PAIRS = [
  ["--ink", "--card", BODY_MIN],
  ["--ink", "--bg-base", BODY_MIN],
  ["--ink-soft", "--card", BODY_MIN],
  ["--ink-soft", "--bg-base", BODY_MIN],
  ["--titlebar-ink", "--titlebar-bg", BODY_MIN],
  ["--on-accent", "--accent", LARGE_MIN],
  ["--on-zone", "--zone-masc", BODY_MIN],
  ["--on-zone", "--zone-fem", BODY_MIN],
  ["--on-zone", "--zone-neutral", BODY_MIN],
  ["--on-zone", "--zone-grow", BODY_MIN],
];

// Matches any rule whose selector mentions :root or [data-theme=…], so it
// handles all three forms in use:
//   :root, [data-theme="blossom"] { … }   [data-theme="paper"] { … }   :root { … }
function parseThemes(css) {
  const themes = new Map();
  const blockRe = /((?::root|\[data-theme=)[^{}]*?)\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const named = m[1].match(/data-theme="([a-z-]+)"/);
    const id = named ? named[1] : "blossom";
    const tokens = new Map();
    const tokenRe = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
    let t;
    while ((t = tokenRe.exec(m[2])) !== null) tokens.set(t[1], t[2].trim());
    // a theme may legitimately appear in more than one block; merge them
    const existing = themes.get(id) || new Map();
    for (const [k, v] of tokens) existing.set(k, v);
    themes.set(id, existing);
  }
  return themes;
}

function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  if (h.length === 3) {
    return [h[0] + h[0], h[1] + h[1], h[2] + h[2]].map((p) => parseInt(p, 16));
  }
  if (h.length === 6) {
    return [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((p) => parseInt(p, 16));
  }
  return null;
}

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function run(cssPath, electronThemePath) {
  const css = fs.readFileSync(cssPath, "utf8");
  const themes = parseThemes(css);
  const failures = [];

  if (!themes.has("blossom")) {
    failures.push("no :root block found — blossom must be defined on bare :root");
    return failures;
  }

  // Blossom must actually declare every token the contrast pairs reference,
  // otherwise those pairs silently skip and the checker passes on a stylesheet
  // that has not been tokenized at all.
  const required = new Set(CONTRAST_PAIRS.flatMap(([fg, bg]) => [fg, bg]));
  for (const token of required) {
    if (!themes.get("blossom").has(token)) {
      failures.push(`:root does not define ${token} — required by the contrast checks`);
    }
  }

  const baseline = [...themes.get("blossom").keys()].sort();
  for (const [id, tokens] of themes) {
    if (id === "blossom") continue;
    const names = [...tokens.keys()];
    const missing = baseline.filter((n) => !names.includes(n));
    const extra = names.filter((n) => !baseline.includes(n));
    if (missing.length) failures.push(`theme "${id}" is missing: ${missing.join(", ")}`);
    if (extra.length) failures.push(`theme "${id}" declares tokens blossom lacks: ${extra.join(", ")}`);
  }

  for (const [id, tokens] of themes) {
    for (const [fg, bg, floor] of CONTRAST_PAIRS) {
      const fgv = tokens.get(fg);
      const bgv = tokens.get(bg);
      if (!fgv || !bgv) continue; // parity check above already reports this
      const ratio = contrast(fgv, bgv);
      if (ratio === null) {
        failures.push(`theme "${id}": ${fg} or ${bg} is not a plain hex color (${fgv} / ${bgv})`);
        continue;
      }
      if (ratio < floor) {
        failures.push(
          `theme "${id}": ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${floor}:1`,
        );
      }
    }
  }

  // Cross-file check: main-process chrome colors must cover the same ids.
  if (fs.existsSync(electronThemePath)) {
    const src = fs.readFileSync(electronThemePath, "utf8");
    for (const id of themes.keys()) {
      if (!src.includes(`"${id}"`)) {
        failures.push(`electron/src/theme.ts has no entry for theme "${id}"`);
      }
    }
  }

  return failures;
}

const root = path.join(__dirname, "..");
const cssArg = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "dashboard-react", "src", "index.css");
const failures = run(cssArg, path.join(root, "electron", "src", "theme.ts"));

if (failures.length) {
  console.error("Theme token check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("Theme token check passed.");
```

- [ ] **Step 3: Run it against the bad fixture to verify it fails**

Run: `node scripts/test_theme_tokens.js scripts/__fixture-bad.css`

Expected: exit 1, printing both `theme "broken" is missing: --ink-soft` and a contrast failure for `--ink` on `--card`.

- [ ] **Step 4: Run it against the real stylesheet**

Run: `node scripts/test_theme_tokens.js`

Expected: exit 1 — today's `:root` has none of these token names yet. That is correct; Task 2 makes it pass.

- [ ] **Step 5: Wire it into CI**

In `.github/workflows/ci.yml`, after the existing "Test protocol path containment" step, add:

```yaml
      - name: Test theme tokens (parity + contrast)
        run: node scripts/test_theme_tokens.js
```

- [ ] **Step 6: Delete the fixture and commit**

```bash
rm scripts/__fixture-bad.css
git add scripts/test_theme_tokens.js .github/workflows/ci.yml
git commit -m "test: add theme token parity and contrast checker"
```

Note: CI will be red until Task 2 lands. That is intended and it is why these two tasks are adjacent — do not merge Task 1 alone to a branch that must stay green.

---

## Task 2: Chrome token sweep (blossom only)

Convert `index.css` so no chrome color is hardcoded, with blossom's values unchanged.

**Files:**
- Modify: `dashboard-react/src/index.css` (`:root` at lines 1-14, then throughout)

**Interfaces:**
- Consumes: Task 1's checker.
- Produces: the complete chrome token vocabulary every later task and every palette uses:
  `--bg-base`, `--bg-glow-1`, `--bg-glow-2`, `--card`, `--card-2`, `--line`, `--shadow`, `--ink`, `--ink-soft`, `--accent`, `--accent-2`, `--on-accent`, `--on-zone`, `--danger`, `--danger-bg`, `--success`, `--success-bg`, `--titlebar-bg`, `--titlebar-ink`, `--wave`, `--wave-progress`, `--wave-cursor`, `--radius`.

- [ ] **Step 1: Replace the `:root` block**

Replace lines 1-14 of `dashboard-react/src/index.css` with:

```css
/* Blossom — the default theme. Every other theme in this file overrides these
   same token names under [data-theme="…"]; scripts/test_theme_tokens.js
   fails the build if any theme's token set drifts from this one.

   The selectors are attribute selectors rather than :root[data-theme] on
   purpose: that lets any element opt into a theme's tokens, which is how the
   swatch chips in Settings preview a theme without duplicating its colors.
   Blossom is listed twice for the same reason — bare :root makes it the
   default, and [data-theme="blossom"] lets a chip request it explicitly even
   while another theme is active.

   Two groups, and the difference matters:
     CHROME tokens (surfaces, text, accents) are free to change per theme.
     DATA tokens (--zone-*) encode meaning — see the color convention at the
     top of zones.ts. Themes retune them for legibility on their own
     background; they never reassign which color means what. */
:root,
[data-theme="blossom"] {
  /* chrome — surfaces */
  --bg-base: #f5f0ff;
  --bg-glow-1: #ffd9ea;
  --bg-glow-2: #e4dbff;
  --card: #fffafd;
  --card-2: #fff0f7;
  --line: #ffffff;
  --shadow: 0 8px 24px rgba(186, 142, 196, 0.18);
  /* chrome — text */
  --ink: #6b5876;
  --ink-soft: #9d8ba8;
  --on-accent: #ffffff;
  --on-zone: #5a4566;
  /* chrome — accents */
  --accent: #ffb6d5;
  --accent-2: #c9b6ff;
  /* chrome — states */
  --danger: #c84545;
  --danger-bg: #ffe8e8;
  --success: #3f9c78;
  --success-bg: #eafaf3;
  /* chrome — desktop title bar (mirrored in electron/src/theme.ts) */
  --titlebar-bg: #ffd9ea;
  --titlebar-ink: #7a5a92;
  /* chrome — waveform player */
  --wave: #bfa9e6;
  --wave-progress: #ff9ec5;
  --wave-cursor: #ff89bb;
  /* data — meaning-bearing, see zones.ts */
  --zone-masc: #bcd3f0;
  --zone-fem: #ffb6d5;
  --zone-neutral: #ffe9a8;
  --zone-grow: #cdc6da;
  --zone-soft: #d7d0e8;
  --zone-comfy: #cdeadd;
  --zone-strong: #ffd9ea;
  /* non-color */
  --radius: 22px;
}
```

The old `--pink` / `--pink-soft` / `--pink-bg` / `--lav` / `--lav-soft` / `--lav-bg` / `--mint` / `--butter` names are gone — they described hues rather than roles, which does not survive eight themes.

- [ ] **Step 2: Rewrite the `body` background to use the new names**

The old rule referenced `--pink-soft` / `--lav-soft` / `--pink-bg` / `--lav-bg`. Replace its `background` declaration with:

```css
  background:
    radial-gradient(1200px 600px at 15% -5%, var(--bg-glow-1), transparent 60%),
    radial-gradient(1100px 700px at 95% 0%, var(--bg-glow-2), transparent 55%),
    linear-gradient(160deg, var(--card-2), var(--bg-base));
```

- [ ] **Step 3: Sweep the remaining hardcoded colors**

Work top to bottom through `index.css` and replace every literal color with the token whose role it plays. The mapping for the values that appear most:

| Literal | Token |
| --- | --- |
| `#fff` / `#ffffff` as a border or card edge | `var(--line)` |
| `#fff` as text on a gradient button | `var(--on-accent)` |
| `#fffafd` | `var(--card)` |
| `#fff0f7`, `#fffafd` panels | `var(--card-2)` |
| `#6b5876` | `var(--ink)` |
| `#9d8ba8`, `#b06a96`, `#7a5a92`, `#8a6aa8` | `var(--ink-soft)` |
| `#5a4566` | `var(--on-zone)` |
| `#ffb6d5`, `#ff6f9c`, `#ff8a80`, `#d784ac` | `var(--accent)` |
| `#c9b6ff`, `#c0a9d6` | `var(--accent-2)` |
| `#c84545`, `#e05d5d`, `#855` | `var(--danger)` |
| `#ffe8e8`, `#ffcccc` | `var(--danger-bg)` |
| `#3f9c78` | `var(--success)` |
| `#eafaf3`, `#cdeee0` | `var(--success-bg)` |
| `#ffd9ea` in the titlebar rule | `var(--titlebar-bg)` |
| `rgba(186,142,196,.18)` and similar drop shadows | `var(--shadow)` |

Judgement call to make consistently: a near-white used as a *surface* is `--card`; a near-white used as *text on a colored fill* is `--on-accent`. Getting these backwards is invisible in blossom and glaring in cocoa.

- [ ] **Step 4: Verify no literals remain**

Run:

```bash
grep -nE "#[0-9a-fA-F]{3,8}\b" dashboard-react/src/index.css | grep -v "^[0-9]*: *--"
```

Expected: no output. Any hit is a color outside the `:root` block that still needs a token.

- [ ] **Step 5: Run the token checker**

Run: `node scripts/test_theme_tokens.js`

Expected: PASS. One theme, so parity is trivial; the contrast pairs are the real assertion, and blossom's existing colors clear them.

- [ ] **Step 6: Verify blossom is unchanged**

Run: `cd dashboard-react && npm install && npm run build && npm run dev`

Open the dashboard and compare against the live site at <https://yuuzulight.github.io/Euphonia/>. Check the hero, a stat card with its zone bar and pill, the waveform player, a metric modal, and Settings. Any visible difference is a mapping error from Step 3, not an improvement.

- [ ] **Step 7: Commit**

```bash
git add dashboard-react/src/index.css
git commit -m "refactor: express every chrome color in index.css as a token"
```

---

## Task 3: Theme state and pre-paint application

**Files:**
- Create: `dashboard-react/src/theme/themes.ts`
- Create: `dashboard-react/src/theme/themeStore.ts`
- Modify: `dashboard-react/index.html`

**Interfaces:**
- Consumes: the token vocabulary from Task 2.
- Produces:
  - `type ThemeId`, `type ThemeMode = "light" | "dark" | "auto"`, `interface ThemePref { mode: ThemeMode; light: ThemeId; dark: ThemeId }`
  - `LIGHT_THEMES: ThemeId[]`, `DARK_THEMES: ThemeId[]`, `THEME_NAMES: Record<ThemeId, string>`
  - `loadPref(): ThemePref`, `savePref(p: ThemePref): void`, `resolvePref(p: ThemePref): ThemeId`, `applyPref(p: ThemePref): ThemeId`, `onSystemThemeChange(cb: () => void): () => void`, `THEME_CHANGE_EVENT: string`

- [ ] **Step 1: Write `themes.ts`**

```ts
// The eight theme ids, split by family. "auto" mode swaps between the user's
// chosen favorite in each family, which is why the split lives here rather
// than being inferred from the css.
export type ThemeId =
  | "blossom"
  | "paper"
  | "light-mint"
  | "dusk-plum"
  | "dark-mint"
  | "midnight"
  | "cocoa"
  | "amber-night";

export const LIGHT_THEMES: ThemeId[] = ["blossom", "paper", "light-mint"];
export const DARK_THEMES: ThemeId[] = [
  "dusk-plum",
  "dark-mint",
  "midnight",
  "cocoa",
  "amber-night",
];

export const THEME_NAMES: Record<ThemeId, string> = {
  blossom: "blossom",
  paper: "paper",
  "light-mint": "light mint",
  "dusk-plum": "dusk plum",
  "dark-mint": "dark mint",
  midnight: "midnight",
  cocoa: "cocoa",
  "amber-night": "amber night",
};

export function isDarkTheme(id: ThemeId): boolean {
  return DARK_THEMES.includes(id);
}
```

- [ ] **Step 2: Write `themeStore.ts`**

```ts
import { type ThemeId, LIGHT_THEMES, DARK_THEMES } from "./themes";

export type ThemeMode = "light" | "dark" | "auto";

export interface ThemePref {
  mode: ThemeMode;
  light: ThemeId;
  dark: ThemeId;
}

// Bumping this key is a reset for every existing user — don't.
export const STORAGE_KEY = "euphonia:theme";

// Fired on <window> after the theme changes, so the color hook can re-read the
// computed tokens. CustomEvent detail is the resolved ThemeId.
export const THEME_CHANGE_EVENT = "euphonia:themechange";

// Defaults chosen so an existing user on a light-themed OS sees no change.
export const DEFAULT_PREF: ThemePref = {
  mode: "auto",
  light: "blossom",
  dark: "dusk-plum",
};

export function loadPref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREF;
    const parsed = JSON.parse(raw) as Partial<ThemePref>;
    return {
      mode:
        parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "auto"
          ? parsed.mode
          : DEFAULT_PREF.mode,
      light:
        parsed.light && LIGHT_THEMES.includes(parsed.light)
          ? parsed.light
          : DEFAULT_PREF.light,
      dark:
        parsed.dark && DARK_THEMES.includes(parsed.dark)
          ? parsed.dark
          : DEFAULT_PREF.dark,
    };
  } catch {
    // corrupt or unavailable storage is not worth crashing the app over
    return DEFAULT_PREF;
  }
}

export function savePref(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // private-mode browsers can refuse writes; the theme still applies for
    // this session, it just won't be remembered.
  }
}

export function systemPrefersDark(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolvePref(pref: ThemePref): ThemeId {
  if (pref.mode === "light") return pref.light;
  if (pref.mode === "dark") return pref.dark;
  return systemPrefersDark() ? pref.dark : pref.light;
}

// Applies the theme to <html>, tells the desktop shell (no-op in a browser),
// and notifies the color hook. Returns the id it resolved to.
export function applyPref(pref: ThemePref): ThemeId {
  const id = resolvePref(pref);
  document.documentElement.setAttribute("data-theme", id);
  window.euphonia?.setTheme?.(id);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: id }));
  return id;
}

// Subscribe to OS light/dark flips. Returns an unsubscribe function.
export function onSystemThemeChange(cb: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
```

- [ ] **Step 3: Declare `setTheme` on the bridge**

`applyPref` above calls `window.euphonia?.setTheme?.(id)`, so the type has to exist now or Task 6's typecheck fails. In `dashboard-react/src/vg-bridge.ts`, add to the bridge interface:

```ts
  /** Desktop only — repaints the native title bar. Absent in browser mode,
      which is why it's optional and called with `?.`. Implemented in
      electron/src/preload.ts (see Task 10). */
  setTheme?: (id: string) => void;
```

- [ ] **Step 4: Add the pre-paint script to `index.html`**

Inside `<head>`, immediately after the `theme-color` meta tag:

```html
    <!-- Applies the saved theme before first paint. This deliberately
         duplicates resolvePref() from src/theme/themeStore.ts rather than
         importing it: the module graph hasn't loaded yet at this point, and
         anything async here means a white flash on every load for dark-theme
         users. Keep the two in sync — it's ~6 lines, same trade as zones.ts. -->
    <script>
      (function () {
        try {
          var p = JSON.parse(localStorage.getItem("euphonia:theme") || "null");
          if (!p) p = { mode: "auto", light: "blossom", dark: "dusk-plum" };
          var dark =
            p.mode === "dark" ||
            (p.mode === "auto" &&
              window.matchMedia("(prefers-color-scheme: dark)").matches);
          document.documentElement.setAttribute("data-theme", dark ? p.dark : p.light);
        } catch (e) {
          document.documentElement.setAttribute("data-theme", "blossom");
        }
      })();
    </script>
```

- [ ] **Step 5: Verify it applies before paint**

Run: `cd dashboard-react && npm run dev`

In the browser console:

```js
localStorage.setItem("euphonia:theme", JSON.stringify({mode:"dark",light:"blossom",dark:"dusk-plum"}));
location.reload();
```

Expected: `<html data-theme="dusk-plum">` in the elements panel from the very first frame. The page still looks like blossom — the `dusk-plum` block doesn't exist until Task 5 — but the attribute must be there with no flash.

Then reset: `localStorage.removeItem("euphonia:theme"); location.reload();`

- [ ] **Step 6: Commit**

```bash
git add dashboard-react/src/theme dashboard-react/src/vg-bridge.ts dashboard-react/index.html
git commit -m "feat: add theme preference storage and pre-paint application"
```

---

## Task 4: The color hook

Give JavaScript-drawn surfaces access to the live token values.

**Files:**
- Create: `dashboard-react/src/theme/ThemeProvider.tsx`
- Modify: `dashboard-react/src/main.tsx`

**Interfaces:**
- Consumes: `themeStore.ts` and `themes.ts` from Task 3.
- Produces:
  - `<ThemeProvider>` — wraps the app.
  - `useTheme(): { pref: ThemePref; resolved: ThemeId; setPref: (p: ThemePref) => void; toggle: () => void }`
  - `useThemeColors(): ThemeColors` where `ThemeColors` is `{ zoneMasc, zoneFem, zoneNeutral, zoneGrow, zoneSoft, zoneComfy, zoneStrong, accent, accent2, ink, inkSoft, card, line, onZone, wave, waveProgress, waveCursor }`, all `string`.

- [ ] **Step 1: Write the provider**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type ThemeId, isDarkTheme } from "./themes";
import {
  type ThemePref,
  THEME_CHANGE_EVENT,
  applyPref,
  loadPref,
  onSystemThemeChange,
  resolvePref,
  savePref,
} from "./themeStore";

export interface ThemeColors {
  zoneMasc: string;
  zoneFem: string;
  zoneNeutral: string;
  zoneGrow: string;
  zoneSoft: string;
  zoneComfy: string;
  zoneStrong: string;
  accent: string;
  accent2: string;
  ink: string;
  inkSoft: string;
  card: string;
  line: string;
  onZone: string;
  wave: string;
  waveProgress: string;
  waveCursor: string;
}

const TOKEN_OF: Record<keyof ThemeColors, string> = {
  zoneMasc: "--zone-masc",
  zoneFem: "--zone-fem",
  zoneNeutral: "--zone-neutral",
  zoneGrow: "--zone-grow",
  zoneSoft: "--zone-soft",
  zoneComfy: "--zone-comfy",
  zoneStrong: "--zone-strong",
  accent: "--accent",
  accent2: "--accent-2",
  ink: "--ink",
  inkSoft: "--ink-soft",
  card: "--card",
  line: "--line",
  onZone: "--on-zone",
  wave: "--wave",
  waveProgress: "--wave-progress",
  waveCursor: "--wave-cursor",
};

// One getComputedStyle read per theme change, not per component per render.
function readColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const out = {} as ThemeColors;
  for (const key of Object.keys(TOKEN_OF) as (keyof ThemeColors)[]) {
    out[key] = style.getPropertyValue(TOKEN_OF[key]).trim();
  }
  return out;
}

interface ThemeContextValue {
  pref: ThemePref;
  resolved: ThemeId;
  colors: ThemeColors;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => loadPref());
  const [resolved, setResolved] = useState<ThemeId>(() => resolvePref(loadPref()));
  const [colors, setColors] = useState<ThemeColors>(() => readColors());

  // Re-read the computed tokens whenever the applied theme changes.
  useEffect(() => {
    const onChange = () => setColors(readColors());
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  }, []);

  // The pre-paint script in index.html already set data-theme; this re-applies
  // through the same path so the desktop shell and the color hook both hear it.
  useEffect(() => {
    setResolved(applyPref(pref));
  }, [pref]);

  // Follow the OS while in auto mode.
  useEffect(() => {
    if (pref.mode !== "auto") return;
    return onSystemThemeChange(() => setResolved(applyPref(pref)));
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    savePref(next);
    setPrefState(next);
  }, []);

  // Flip to the other family, committing to an explicit mode.
  const toggle = useCallback(() => {
    setPref({ ...pref, mode: isDarkTheme(resolved) ? "light" : "dark" });
  }, [pref, resolved, setPref]);

  const value = useMemo(
    () => ({ pref, resolved, colors, setPref, toggle }),
    [pref, resolved, colors, setPref, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export function useTheme() {
  const { pref, resolved, setPref, toggle } = useThemeContext();
  return { pref, resolved, setPref, toggle };
}

export function useThemeColors(): ThemeColors {
  return useThemeContext().colors;
}
```

- [ ] **Step 2: Mount it**

`dashboard-react/src/main.tsx` becomes exactly:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./browser/installBridge";
import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
```

Note the named `StrictMode` import — this repo uses the automatic JSX runtime and never imports `React` as a bare default (Global Constraints). The `installBridge` side-effect import must stay above the render.

- [ ] **Step 3: Verify the hook reads real values**

Run `npm run dev`, then in the console:

```js
getComputedStyle(document.documentElement).getPropertyValue("--zone-fem").trim()
```

Expected: `#ffb6d5`.

- [ ] **Step 4: Commit**

```bash
git add dashboard-react/src/theme/ThemeProvider.tsx dashboard-react/src/main.tsx
git commit -m "feat: add theme context and live token color hook"
```

---

## Task 5: The seven remaining palettes

**Files:**
- Modify: `dashboard-react/src/index.css` (append after the `:root` block)

**Interfaces:**
- Consumes: the token vocabulary from Task 2.
- Produces: seven `:root[data-theme="…"]` blocks. No new token names.

- [ ] **Step 1: Add the two remaining light themes**

Transcribe from `docs/specs/2026-08-16-theme-mockups/more-themes.html` (paper) and `mint-theme.html` (M1). Append to `index.css`:

```css
[data-theme="paper"] {
  --bg-base: #f2efe8;
  --bg-glow-1: #f6f0e4;
  --bg-glow-2: #efeade;
  --card: #fffdf8;
  --card-2: #f7f4ee;
  --line: #ffffff;
  --shadow: 0 6px 18px rgba(140, 125, 100, 0.15);
  --ink: #45403a;
  --ink-soft: #756d62;
  --on-accent: #ffffff;
  --on-zone: #4a4036;
  --accent: #c2a878;
  --accent-2: #a89a84;
  --danger: #a53f3f;
  --danger-bg: #f7e6e2;
  --success: #3d7a5f;
  --success-bg: #e8f2ea;
  --titlebar-bg: #ece4d6;
  --titlebar-ink: #5c554a;
  --wave: #c5b394;
  --wave-progress: #c2a878;
  --wave-cursor: #a8895a;
  --zone-masc: #bcd3f0;
  --zone-fem: #ffb6d5;
  --zone-neutral: #ffe9a8;
  --zone-grow: #cdc6da;
  --zone-soft: #d7d0e8;
  --zone-comfy: #cdeadd;
  --zone-strong: #ffd9ea;
  --radius: 22px;
}
[data-theme="light-mint"] {
  --bg-base: #eef6f2;
  --bg-glow-1: #d9f2e6;
  --bg-glow-2: #e3f1ea;
  --card: #fbfffd;
  --card-2: #f2faf6;
  --line: #ffffff;
  --shadow: 0 8px 24px rgba(120, 165, 145, 0.2);
  --ink: #355044;
  --ink-soft: #63796d;
  --on-accent: #ffffff;
  --on-zone: #2f4a3e;
  --accent: #4f9e7f;
  --accent-2: #7fa8c4;
  --danger: #b04141;
  --danger-bg: #fbe7e7;
  --success: #37795d;
  --success-bg: #e6f4ec;
  --titlebar-bg: #cfeee0;
  --titlebar-ink: #365f4d;
  --wave: #9dc0b2;
  --wave-progress: #5fae8d;
  --wave-cursor: #3f8f6d;
  --zone-masc: #bcd3f0;
  --zone-fem: #ffb6d5;
  --zone-neutral: #ffe9a8;
  --zone-grow: #cdc6da;
  --zone-soft: #d7d0e8;
  --zone-comfy: #cdeadd;
  --zone-strong: #ffd9ea;
  --radius: 22px;
}
```

- [ ] **Step 2: Add the five dark themes**

Data tokens are lifted here so pastels survive a dark card. Midnight brightens `--zone-masc` and deepens its chrome; amber-night cools `--zone-masc` — both per the spec's "Token model" section.

```css
[data-theme="dusk-plum"] {
  --bg-base: #14131f;
  --bg-glow-1: #2c1f38;
  --bg-glow-2: #221f3d;
  --card: #221b2e;
  --card-2: #1b1626;
  --line: rgba(255, 255, 255, 0.07);
  --shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  --ink: #ece3f5;
  --ink-soft: #a294b4;
  --on-accent: #241a2e;
  --on-zone: #2a1f33;
  --accent: #f093c2;
  --accent-2: #b6a2f2;
  --danger: #f08a8a;
  --danger-bg: #3a1f22;
  --success: #7fd2ac;
  --success-bg: #17301f;
  --titlebar-bg: #251d33;
  --titlebar-ink: #c8b6dd;
  --wave: #7d6aa8;
  --wave-progress: #f093c2;
  --wave-cursor: #ffa8d0;
  --zone-masc: #a8c8ee;
  --zone-fem: #f59ec6;
  --zone-neutral: #e8d089;
  --zone-grow: #b3a9c6;
  --zone-soft: #b9b0d2;
  --zone-comfy: #a6d6c0;
  --zone-strong: #eeb0cd;
  --radius: 22px;
}
[data-theme="dark-mint"] {
  --bg-base: #0f1614;
  --bg-glow-1: #17281f;
  --bg-glow-2: #16231f;
  --card: #182420;
  --card-2: #131d1a;
  --line: rgba(255, 255, 255, 0.07);
  --shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  --ink: #e2efe8;
  --ink-soft: #92a89d;
  --on-accent: #10231b;
  --on-zone: #16302a;
  --accent: #7fd7b4;
  --accent-2: #8fb8d8;
  --danger: #f08a8a;
  --danger-bg: #33201f;
  --success: #7fd7b4;
  --success-bg: #16301f;
  --titlebar-bg: #1b2a24;
  --titlebar-ink: #a9c9ba;
  --wave: #5f7d71;
  --wave-progress: #7fd7b4;
  --wave-cursor: #9ee8c8;
  --zone-masc: #a8c8ee;
  --zone-fem: #f59ec6;
  --zone-neutral: #e8d089;
  --zone-grow: #b3a9c6;
  --zone-soft: #b9b0d2;
  --zone-comfy: #a6d6c0;
  --zone-strong: #eeb0cd;
  --radius: 22px;
}
[data-theme="midnight"] {
  --bg-base: #0d1322;
  --bg-glow-1: #1a2440;
  --bg-glow-2: #151d33;
  --card: #182036;
  --card-2: #121a2c;
  --line: rgba(255, 255, 255, 0.07);
  --shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  --ink: #e3e9f5;
  --ink-soft: #93a0bd;
  --on-accent: #141c30;
  --on-zone: #1a2338;
  --accent: #8fa6f0;
  --accent-2: #b79ae8;
  --danger: #f08a8a;
  --danger-bg: #32202a;
  --success: #7fd2ac;
  --success-bg: #15301f;
  --titlebar-bg: #141c30;
  --titlebar-ink: #a8b6d4;
  --wave: #5c6a90;
  --wave-progress: #8fa6f0;
  --wave-cursor: #b0c2ff;
  /* --zone-masc lifted well clear of the navy chrome — see spec, Token model */
  --zone-masc: #c3dcff;
  --zone-fem: #f59ec6;
  --zone-neutral: #e8d089;
  --zone-grow: #b3a9c6;
  --zone-soft: #b9b0d2;
  --zone-comfy: #a6d6c0;
  --zone-strong: #eeb0cd;
  --radius: 22px;
}
[data-theme="cocoa"] {
  --bg-base: #16110f;
  --bg-glow-1: #261c18;
  --bg-glow-2: #1f1714;
  --card: #211a17;
  --card-2: #1a1411;
  --line: rgba(255, 255, 255, 0.07);
  --shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  --ink: #f0e6df;
  --ink-soft: #ab998e;
  --on-accent: #241b17;
  --on-zone: #2e211b;
  --accent: #e0a882;
  --accent-2: #c98f6f;
  --danger: #f08a8a;
  --danger-bg: #38201d;
  --success: #7fd2ac;
  --success-bg: #17301f;
  --titlebar-bg: #241b17;
  --titlebar-ink: #cdb5a5;
  --wave: #7a6559;
  --wave-progress: #e0a882;
  --wave-cursor: #f5c3a0;
  --zone-masc: #a8c8ee;
  --zone-fem: #f59ec6;
  --zone-neutral: #e8d089;
  --zone-grow: #b3a9c6;
  --zone-soft: #b9b0d2;
  --zone-comfy: #a6d6c0;
  --zone-strong: #eeb0cd;
  --radius: 22px;
}
[data-theme="amber-night"] {
  --bg-base: #131007;
  --bg-glow-1: #1f1810;
  --bg-glow-2: #1a150c;
  --card: #1e1810;
  --card-2: #17120b;
  --line: rgba(255, 255, 255, 0.07);
  --shadow: 0 8px 20px rgba(0, 0, 0, 0.55);
  --ink: #f3e7cd;
  --ink-soft: #b0a084;
  --on-accent: #1f1810;
  --on-zone: #2b2213;
  --accent: #e8c37a;
  --accent-2: #d9a94f;
  --danger: #f0928a;
  --danger-bg: #351f16;
  --success: #97d2ac;
  --success-bg: #1b3018;
  --titlebar-bg: #1f1810;
  --titlebar-ink: #d8bd8a;
  --wave: #806f4f;
  --wave-progress: #e8c37a;
  --wave-cursor: #f7dda2;
  /* --zone-masc cooled to survive the warm cast — see spec, Token model */
  --zone-masc: #a9cdf5;
  --zone-fem: #f0a0c0;
  --zone-neutral: #efd390;
  --zone-grow: #b3a9c6;
  --zone-soft: #b9b0d2;
  --zone-comfy: #a6d6c0;
  --zone-strong: #eeb0cd;
  --radius: 22px;
}
```

- [ ] **Step 3: Run the token checker**

Run: `node scripts/test_theme_tokens.js`

Expected: PASS across all eight themes. If it reports a contrast failure, adjust that theme's `--ink-soft` or `--card` until it clears — do not lower the floor in the script.

- [ ] **Step 4: Eyeball each theme**

Run `npm run dev`, then in the console cycle through them:

```js
["blossom","paper","light-mint","dusk-plum","dark-mint","midnight","cocoa","amber-night"]
  .forEach((t,i)=>setTimeout(()=>document.documentElement.setAttribute("data-theme",t),i*1500));
```

Charts and the waveform will still be wrong — they're hardcoded until Tasks 6 and 7. Cards, text, buttons and the background should all be correct.

- [ ] **Step 5: Commit**

```bash
git add dashboard-react/src/index.css
git commit -m "feat: add the seven non-default theme palettes"
```

---

## Task 6: Route the zone colors through the hook

**Files:**
- Modify: `dashboard-react/src/zones.ts`
- Modify: `dashboard-react/src/metrics.ts`, `components/StatCard.tsx`, `components/ZoneBar.tsx`, `components/RegisterSection.tsx`, `components/MetricModal.tsx`, `annotations/lib/StatCompare.tsx`

**Interfaces:**
- Consumes: `useThemeColors()` from Task 4.
- Produces: `zoneColor(key: ZoneColorKey, colors: ThemeColors): string` and `type ZoneColorKey = "masc" | "fem" | "neutral" | "grow" | "soft" | "comfy" | "strong"`. `Zone.color` becomes `ZoneColorKey` instead of a hex string.

- [ ] **Step 1: Change `Zone.color` to a key**

In `zones.ts`, keep the entire comment header — it is the convention this task exists to preserve — and change the type plus the constants:

```ts
export type ZoneColorKey =
  | "masc"
  | "fem"
  | "neutral"
  | "grow"
  | "soft"
  | "comfy"
  | "strong";

export interface Zone {
  from: number;
  to: number;
  color: ZoneColorKey;
  name: string;
}

// These used to be hex literals. They're keys now so each theme can supply a
// legibility-tuned variant while the meaning stays fixed — the convention
// above is unchanged, only the delivery mechanism moved.
export const MASC: ZoneColorKey = "masc";
export const FEM: ZoneColorKey = "fem";
export const BUTTER: ZoneColorKey = "neutral";
export const GROW: ZoneColorKey = "grow";

export function zoneColor(key: ZoneColorKey, colors: ThemeColors): string {
  switch (key) {
    case "masc": return colors.zoneMasc;
    case "fem": return colors.zoneFem;
    case "neutral": return colors.zoneNeutral;
    case "grow": return colors.zoneGrow;
    case "soft": return colors.zoneSoft;
    case "comfy": return colors.zoneComfy;
    case "strong": return colors.zoneStrong;
  }
}
```

Add `import type { ThemeColors } from "./theme/ThemeProvider";` at the top. Update `LOUD_ZONES` to use `"soft"`, `"comfy"`, `"strong"` in place of its three hex literals. Every other `*_ZONES` array already refers to `MASC`/`FEM`/`BUTTER`/`GROW` and needs no edit.

- [ ] **Step 2: Update `StatCard.tsx`**

The pill currently sets `background: z.color` and a hardcoded `color: "#5a4566"`:

```tsx
import { useThemeColors } from "../theme/ThemeProvider";
import { type Zone, zoneOf, zoneColor, fmt } from "../zones";

// inside StatCard, before the return:
const colors = useThemeColors();

// and in the pill:
<span
  className="pill"
  style={{ background: zoneColor(z.color, colors), color: colors.onZone }}
>
  {z.name}
</span>
```

- [ ] **Step 3: Update the other zone consumers**

In each of `ZoneBar.tsx`, `RegisterSection.tsx`, `MetricModal.tsx`, `metrics.ts` consumers, and `annotations/lib/StatCompare.tsx`: call `const colors = useThemeColors();` in the component and wrap every `zone.color` read in `zoneColor(zone.color, colors)`. `metrics.ts` is not a component — leave its zone arrays as keys and resolve at the call site.

- [ ] **Step 4: Typecheck**

Run: `cd dashboard-react && npx tsc -b`

Expected: no errors. TypeScript will point at any `Zone.color` still being treated as a string — that list is your remaining work for this task.

- [ ] **Step 5: Verify in the browser**

Run `npm run dev`, set `data-theme` to `midnight` in the console, and confirm the pitch card's zone bar shows a clearly brighter blue than the navy chrome behind it.

- [ ] **Step 6: Commit**

```bash
git add dashboard-react/src/zones.ts dashboard-react/src/components dashboard-react/src/annotations
git commit -m "feat: resolve zone colors through the theme hook"
```

---

## Task 7: Waveform, charts, and icons

**Files:**
- Modify: `dashboard-react/src/components/WaveformPlayer.tsx:60-70,110-145`, `icons.tsx`, `emojiMap.tsx`, `LineChart.tsx`, `ContourChart.tsx`, `FormantGauge.tsx`
- Modify: `dashboard-react/src/annotations/lib/MelodyArc.tsx`, `PhraseEndingStrip.tsx`

**Interfaces:**
- Consumes: `useThemeColors()`.
- Produces: no new exports.

- [ ] **Step 1: Theme the wavesurfer player**

In `WaveformPlayer.tsx`, replace the hardcoded props and region colors:

```tsx
const colors = useThemeColors();

// region plugin options
lineColor: colors.waveCursor,
labelBackground: colors.inkSoft,
labelColor: colors.card,

// <WavesurferPlayer …>
waveColor={colors.wave}
progressColor={colors.waveProgress}
cursorColor={colors.waveCursor}
```

Then add an effect so an existing instance repaints instead of rebuilding — rebuilding would drop playback position:

```tsx
useEffect(() => {
  wavesurfer?.setOptions({
    waveColor: colors.wave,
    progressColor: colors.waveProgress,
    cursorColor: colors.waveCursor,
  });
}, [wavesurfer, colors.wave, colors.waveProgress, colors.waveCursor]);
```

Use whatever the file already names the wavesurfer instance from `onReady`.

- [ ] **Step 2: Make the icons inherit**

`icons.tsx` holds 54 literals. For each decorative single-color mark, replace `fill="#…"` / `stroke="#…"` with `fill="currentColor"` / `stroke="currentColor"` — they then inherit the surrounding text color for free in all eight themes. The two-color speaker glyph at the bottom of `WaveformPlayer.tsx` takes `colors.accent2` for both its `fill` and `stroke`.

Leave the app mark's trans-pride-flag bars as literals. Those are flag colors, not theme colors, and must not shift per theme.

- [ ] **Step 3: Theme the charts**

In `LineChart.tsx`, `ContourChart.tsx`, `FormantGauge.tsx`, `MelodyArc.tsx` and `PhraseEndingStrip.tsx`, call `useThemeColors()` and replace literals by role: series strokes → `colors.accent` / `colors.accent2`, axes and gridlines → `colors.line`, labels → `colors.inkSoft`, any zone band → `zoneColor(key, colors)`.

- [ ] **Step 4: Verify no literals remain outside the flag**

Run:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b" dashboard-react/src --include=*.tsx --include=*.ts | grep -v "index.css"
```

Expected: only the app-mark flag colors in `icons.tsx`.

- [ ] **Step 5: Typecheck, build, and eyeball**

Run: `cd dashboard-react && npx tsc -b && npm run build && npm run dev`

Cycle `data-theme` through all eight and confirm the waveform and every chart change with them, and that playback position survives a switch mid-play.

- [ ] **Step 6: Commit**

```bash
git add dashboard-react/src
git commit -m "feat: theme the waveform, charts, and icons"
```

---

## Task 8: The header toggle

**Files:**
- Create: `dashboard-react/src/components/ThemeToggle.tsx`
- Modify: `dashboard-react/src/App.tsx:136-146`, `dashboard-react/src/index.css`

**Interfaces:**
- Consumes: `useTheme()` from Task 4.
- Produces: `<ThemeToggle />`.

- [ ] **Step 1: Write the component**

```tsx
import { FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "../theme/ThemeProvider";
import { isDarkTheme } from "../theme/themes";

// Flips between the user's chosen light and dark favorites. It never cycles
// all eight — that's what the picker in Settings is for.
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const dark = isDarkTheme(resolved);
  const label = dark ? "switch to light theme" : "switch to dark theme";
  return (
    <button className="theme-toggle" onClick={toggle} title={label} aria-label={label}>
      {dark ? <FiSun /> : <FiMoon />}
    </button>
  );
}
```

It shows the theme you'd move *to*, which is why `dark` picks the sun.

- [ ] **Step 2: Place it beside the gear**

In `App.tsx`, the settings button is absolutely positioned at `top: 0, right: 0`. Wrap both in a row so they don't overlap:

```tsx
<div style={{ position: "absolute", top: 0, right: 0, display: "flex", gap: 6 }}>
  <ThemeToggle />
  <button className="settings-btn" onClick={() => setShowOnboarding(true)} title="Settings">
    ⚙️
  </button>
</div>
```

Remove the inline `style` that previously positioned the settings button on its own.

- [ ] **Step 3: Style it**

Append to `index.css`, matching the existing `.settings-btn` shape:

```css
.theme-toggle {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 999px;
  background: var(--card);
  color: var(--ink-soft);
  box-shadow: var(--shadow);
  font-size: 15px;
  cursor: pointer;
  transition: transform 0.14s ease, color 0.14s ease;
}
.theme-toggle:hover {
  transform: translateY(-1px);
  color: var(--ink);
}
```

- [ ] **Step 4: Verify**

Run `npm run dev`. Click the button: the whole app flips to dusk plum, the icon becomes a sun, and the choice survives a reload. Confirm the gear still opens Settings and the two buttons don't overlap at mobile width (375px).

- [ ] **Step 5: Commit**

```bash
git add dashboard-react/src/components/ThemeToggle.tsx dashboard-react/src/App.tsx dashboard-react/src/index.css
git commit -m "feat: add the header light/dark toggle"
```

---

## Task 9: The Settings picker

**Files:**
- Create: `dashboard-react/src/components/ThemePicker.tsx`
- Modify: `dashboard-react/src/components/OnboardingModal.tsx:82-90`, `dashboard-react/src/index.css`

**Interfaces:**
- Consumes: `useTheme()`, `THEME_NAMES`, `LIGHT_THEMES`, `DARK_THEMES`.
- Produces: `<ThemePicker />`.

- [ ] **Step 1: Write the picker**

```tsx
import { useTheme } from "../theme/ThemeProvider";
import {
  type ThemeId,
  DARK_THEMES,
  LIGHT_THEMES,
  THEME_NAMES,
} from "../theme/themes";
import type { ThemeMode } from "../theme/themeStore";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "light" },
  { id: "dark", label: "dark" },
  { id: "auto", label: "auto" },
];

function Swatches({
  ids,
  selected,
  onPick,
  legend,
}: {
  ids: ThemeId[];
  selected: ThemeId;
  onPick: (id: ThemeId) => void;
  legend: string;
}) {
  return (
    <fieldset className="theme-group">
      <legend>{legend}</legend>
      {ids.map((id) => (
        <label key={id} className={`theme-swatch${id === selected ? " is-on" : ""}`}>
          <input
            type="radio"
            name={legend}
            checked={id === selected}
            onChange={() => onPick(id)}
          />
          <span className="theme-chip" data-theme={id} aria-hidden="true">
            <i />
          </span>
          {THEME_NAMES[id]}
        </label>
      ))}
    </fieldset>
  );
}

export function ThemePicker() {
  const { pref, setPref } = useTheme();
  return (
    <div className="theme-picker">
      <fieldset className="theme-group">
        <legend>appearance</legend>
        {MODES.map((m) => (
          <label key={m.id} className={`theme-mode${pref.mode === m.id ? " is-on" : ""}`}>
            <input
              type="radio"
              name="theme-mode"
              checked={pref.mode === m.id}
              onChange={() => setPref({ ...pref, mode: m.id })}
            />
            {m.label}
          </label>
        ))}
      </fieldset>
      <Swatches
        legend="light themes"
        ids={LIGHT_THEMES}
        selected={pref.light}
        onPick={(id) => setPref({ ...pref, light: id })}
      />
      <Swatches
        legend="dark themes"
        ids={DARK_THEMES}
        selected={pref.dark}
        onPick={(id) => setPref({ ...pref, dark: id })}
      />
    </div>
  );
}
```

Picking a swatch updates that family's favorite; `applyPref` re-resolves, so it takes effect immediately when that family is the one showing and silently otherwise.

- [ ] **Step 2: Style the chips**

The chip previews a theme by *being* that theme — `data-theme` on the span re-scopes the tokens, so no color values are duplicated here:

```css
.theme-picker { display: grid; gap: 14px; margin-bottom: 20px; }
.theme-group { border: none; margin: 0; padding: 0; }
.theme-group legend {
  font-size: 11px; font-weight: 800; color: var(--ink-soft);
  padding: 0; margin-bottom: 7px;
}
.theme-mode, .theme-swatch {
  display: inline-flex; align-items: center; gap: 6px;
  margin: 0 8px 8px 0; padding: 6px 12px;
  border-radius: 999px; background: var(--card-2); color: var(--ink);
  font-size: 12px; font-weight: 700; cursor: pointer;
  border: 2px solid transparent;
}
.theme-mode.is-on, .theme-swatch.is-on { border-color: var(--accent); }
.theme-mode input, .theme-swatch input {
  position: absolute; opacity: 0; width: 0; height: 0;
}
.theme-mode:focus-within, .theme-swatch:focus-within {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
.theme-chip {
  width: 22px; height: 22px; border-radius: 7px; display: grid;
  place-items: center; background: var(--bg-base); border: 1px solid var(--line);
}
.theme-chip i {
  width: 9px; height: 9px; border-radius: 3px; background: var(--accent);
}
```

- [ ] **Step 3: Retitle the modal and mount the picker**

In `OnboardingModal.tsx`, change the heading and add the picker above the Gemini section:

```tsx
<h2>⚙️ Settings</h2>
<ThemePicker />
<h3>💗 Gemini key (optional)</h3>
```

Add a `.modal.onboarding h3` rule to `index.css` matching the existing `h2` treatment at a smaller size, so the demoted heading doesn't look unstyled.

- [ ] **Step 4: Verify**

Run `npm run dev`, open ⚙️, and check: the three mode pills work; each swatch chip previews its own theme's background and accent; picking a dark theme while in light mode changes nothing until you flip; Tab reaches every control and Space selects.

- [ ] **Step 5: Commit**

```bash
git add dashboard-react/src/components/ThemePicker.tsx dashboard-react/src/components/OnboardingModal.tsx dashboard-react/src/index.css
git commit -m "feat: add the theme picker to settings"
```

---

## Task 10: Desktop window chrome

**Files:**
- Create: `electron/src/theme.ts`
- Modify: `electron/src/main.ts:10-31`, `preload.ts`, `ipcHandlers.ts`

**Interfaces:**
- Consumes: the theme ids from Task 3; `window.euphonia.setTheme(id)` is already called by `applyPref`.
- Produces: `WINDOW_CHROME: Record<string, { bg: string; titlebar: string; symbol: string }>`, `readCachedTheme(): string`, `writeCachedTheme(id: string): void`, `chromeFor(id: string)`.

- [ ] **Step 1: Write the main-process theme module**

```ts
import fs from "node:fs";
import path from "node:path";
import { nativeTheme } from "electron";
import { getUserDataRoot } from "./paths";

// Main creates the window before the renderer exists, so it can't read the
// CSS tokens. These three colors per theme are a deliberate duplicate of
// --bg-base / --titlebar-bg / --titlebar-ink in dashboard-react/src/index.css
// — the same trade as zones.ts. scripts/test_theme_tokens.js fails if a theme
// exists in the css but not here.
export const WINDOW_CHROME: Record<string, { bg: string; titlebar: string; symbol: string }> = {
  blossom: { bg: "#f5f0ff", titlebar: "#ffd9ea", symbol: "#7a5a92" },
  paper: { bg: "#f2efe8", titlebar: "#ece4d6", symbol: "#5c554a" },
  "light-mint": { bg: "#eef6f2", titlebar: "#cfeee0", symbol: "#365f4d" },
  "dusk-plum": { bg: "#14131f", titlebar: "#251d33", symbol: "#c8b6dd" },
  "dark-mint": { bg: "#0f1614", titlebar: "#1b2a24", symbol: "#a9c9ba" },
  midnight: { bg: "#0d1322", titlebar: "#141c30", symbol: "#a8b6d4" },
  cocoa: { bg: "#16110f", titlebar: "#241b17", symbol: "#cdb5a5" },
  "amber-night": { bg: "#131007", titlebar: "#1f1810", symbol: "#d8bd8a" },
};

function cachePath(): string {
  return path.join(getUserDataRoot(), "theme.json");
}

// A disposable cache of the renderer's choice, read once at startup so the
// window is created already wearing the right colors. Never the source of
// truth — the renderer's localStorage is.
export function readCachedTheme(): string {
  try {
    const raw = fs.readFileSync(cachePath(), "utf8");
    const id = (JSON.parse(raw) as { theme?: string }).theme;
    if (id && WINDOW_CHROME[id]) return id;
  } catch {
    // missing or corrupt — fall through to the OS preference
  }
  return nativeTheme.shouldUseDarkColors ? "dusk-plum" : "blossom";
}

export function writeCachedTheme(id: string): void {
  if (!WINDOW_CHROME[id]) return;
  try {
    fs.mkdirSync(getUserDataRoot(), { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify({ theme: id }));
  } catch {
    // a failed cache write costs one flash at next launch, nothing more
  }
}

export function chromeFor(id: string) {
  return WINDOW_CHROME[id] ?? WINDOW_CHROME.blossom;
}
```

- [ ] **Step 2: Use it when creating the window**

In `main.ts`, replace the hardcoded overlay block:

```ts
import { chromeFor, readCachedTheme } from "./theme";

function createWindow(): BrowserWindow {
  const chrome = chromeFor(readCachedTheme());
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    icon: getIconPath(),
    backgroundColor: chrome.bg,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: chrome.titlebar,
      symbolColor: chrome.symbol,
      height: 40,
    },
    // …webPreferences unchanged…
```

Keep the existing comment above `titleBarStyle`, updating its reference from `--pink-soft` / `--ink` to `--titlebar-bg` / `--titlebar-ink`.

- [ ] **Step 3: Add the IPC channel**

In `ipcHandlers.ts`, inside `registerIpcHandlers(win)`:

```ts
import { chromeFor, writeCachedTheme } from "./theme";

ipcMain.on("theme:set", (_event, id: string) => {
  const chrome = chromeFor(id);
  writeCachedTheme(id);
  if (!win.isDestroyed()) win.setTitleBarOverlay({
    color: chrome.titlebar,
    symbolColor: chrome.symbol,
    height: 40,
  });
});
```

In `preload.ts`, add to the exposed object:

```ts
setTheme: (id: string) => ipcRenderer.send("theme:set", id),
```

`vg-bridge.ts` already declares `setTheme?` from Task 3 Step 3 — this task supplies the implementation behind it. Browser mode leaves it undefined, and `applyPref` calls it with `?.`, so nothing changes there.

- [ ] **Step 4: Verify the cross-file check catches drift**

Temporarily delete the `cocoa` line from `WINDOW_CHROME`, then run:

Run: `node scripts/test_theme_tokens.js`

Expected: FAIL with `electron/src/theme.ts has no entry for theme "cocoa"`. Restore the line and confirm it passes.

- [ ] **Step 5: Verify in the real app**

Run: `cd electron && npm install && npm run build && npx electron .`

(Needs `ffmpeg` on PATH — see README.) Check: switching theme in Settings repaints the min/max/close buttons immediately; quitting in cocoa and relaunching opens with a dark frame and **no white flash**; deleting `%APPDATA%\Euphonia\theme.json` and relaunching falls back to the OS preference without crashing.

- [ ] **Step 6: Commit**

```bash
git add electron/src
git commit -m "feat: theme the desktop window chrome and cache it for startup"
```

---

## Task 11: Screenshot sweep

**Files:**
- Create: `scripts/screenshot_themes.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: a built `dashboard-react/dist`.
- Produces: PNGs in `screenshots/` for review. Not asserted.

- [ ] **Step 1: Write the sweep**

```js
// Screenshots every theme across the main screens so a card that stayed light
// is easy to spot. Generated for human review — deliberately asserts nothing.
//
// Serves the build over http rather than opening dist/index.html directly:
// Chromium gives file:// pages an opaque origin, where localStorage (which is
// where the theme preference lives) is unreliable and the reference.json fetch
// fails outright. `vite preview` is already a script in dashboard-react.
//
// Run: cd dashboard-react && npm run build && npx vite preview --port 4173 &
//      node ../scripts/screenshot_themes.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const BASE_URL = process.env.EUPHONIA_URL || "http://localhost:4173/";
const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "..", "screenshots");

// Both families point at the same id so the mode value can't affect the
// result — whichever way it resolves, it resolves to the theme under test.
const THEMES = [
  "blossom", "paper", "light-mint",
  "dusk-plum", "dark-mint", "midnight", "cocoa", "amber-night",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
fs.mkdirSync(outDir, { recursive: true });

for (const theme of THEMES) {
  await page.goto(BASE_URL);
  await page.evaluate((t) => {
    localStorage.setItem(
      "euphonia:theme",
      JSON.stringify({ mode: "light", light: t, dark: t }),
    );
  }, theme);
  await page.reload();
  await page.waitForTimeout(700);

  const applied = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  if (applied !== theme) {
    throw new Error(`expected data-theme="${theme}", page had "${applied}"`);
  }

  await page.screenshot({ path: path.join(outDir, `${theme}-dashboard.png`), fullPage: true });

  const gear = page.locator("button.settings-btn");
  if (await gear.count()) {
    await gear.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `${theme}-settings.png`) });
  }
  console.log("captured " + theme);
}

await browser.close();
console.log(`\n${THEMES.length * 2} screenshots in ${outDir}`);
```

- [ ] **Step 2: Ignore the output**

Append to `.gitignore`:

```
# generated by scripts/screenshot_themes.mjs for review
screenshots/
```

- [ ] **Step 3: Run it**

Run, in two shells:

```bash
cd dashboard-react && npm run build && npx vite preview --port 4173
```

```bash
node scripts/screenshot_themes.mjs
```

Expected: 16 PNGs. The script throws if the applied `data-theme` doesn't match the one it asked for, so a silent storage failure can't produce sixteen identical screenshots. Open them and look specifically for a surface that stayed light in a dark theme, unreadable muted text, and whether midnight's zone-bar blue is still distinct from its chrome.

- [ ] **Step 4: Fix anything it surfaces, then commit**

```bash
git add scripts/screenshot_themes.mjs .gitignore
git commit -m "test: add a screenshot sweep across all eight themes"
```

---

## Task 12: Documentation

**Files:**
- Modify: `ARCHITECTURE.md`, `README.md`

- [ ] **Step 1: Document the system in `ARCHITECTURE.md`**

Add a "Theming" section after the existing color-conventions material, covering: the chrome/data token split and why data tokens keep their meaning; the eight ids and their families; where the preference is stored and why it's `localStorage` and not IndexedDB; the pre-paint script's deliberate duplication; and the `electron/src/theme.ts` duplication with the test that guards it.

Update the color-convention text to say the zone colors are now keys resolved per theme, so the next reader doesn't go looking for hex constants in `zones.ts`.

- [ ] **Step 2: Mention it in `README.md`**

One line in the desktop app's "Read your results" area and one in the browser section: eight themes, light and dark, switchable from the header button or ⚙️ Settings, remembered on that device.

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md README.md
git commit -m "docs: document the theme system"
```

---

## Verification checklist

Before calling this done:

- [ ] `node scripts/test_theme_tokens.js` passes — parity, contrast, and electron id coverage.
- [ ] `cd dashboard-react && npx tsc -b && npm run build` clean.
- [ ] `cd electron && npx tsc -b` clean.
- [ ] `node scripts/test_protocol_paths.js` and `python scripts/test_analyze_paths.py` still pass.
- [ ] Blossom is visually identical to the live site.
- [ ] All 16 screenshots reviewed.
- [ ] Desktop app: title bar repaints live, no white flash at launch in a dark theme.
- [ ] Theme survives a reload in both the browser and the desktop app.
- [ ] Auto mode follows an OS light/dark flip without a restart.
