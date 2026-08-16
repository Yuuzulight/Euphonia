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

// Blossom is the pre-existing palette and the spec freezes it, so these four
// pairs are grandfathered at their measured ratios. They are listed explicitly
// rather than skipped: change any of these four token values and the pair stops
// matching this list, so the check trips again. Every other theme must clear the
// floors — no new theme may add entries here.
const BASELINE_EXCEPTIONS = [
  ["blossom", "--ink-soft", "--card"], // 3.04:1
  ["blossom", "--ink-soft", "--bg-base"], // 2.81:1
  ["blossom", "--titlebar-ink", "--titlebar-bg"], // 4.42:1
  ["blossom", "--on-accent", "--accent"], // 1.63:1
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

// The pre-paint script in index.html duplicates the family arrays because it
// runs before any module loads. Adding a theme to the css but not to that file
// means it can never be applied before first paint — a guaranteed flash.
function checkPrePaintScript(htmlPath, themeIds, failures) {
  if (!fs.existsSync(htmlPath)) return;
  const html = fs.readFileSync(htmlPath, "utf8");
  const listed = new Set(
    [...html.matchAll(/"([a-z-]+)"/g)]
      .map((m) => m[1])
      .filter((s) => themeIds.has(s)),
  );
  for (const id of themeIds) {
    if (!listed.has(id)) {
      failures.push(`index.html's pre-paint script does not list theme "${id}"`);
    }
  }
}

function run(cssPath, electronThemePath, htmlPath) {
  // Strip CSS comments before any matching — otherwise a token commented out
  // for debugging still registers as live, and blockRe can wander into a
  // [data-theme="…"] mentioned inside a comment.
  const css = fs.readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
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
      const isBaselineException = BASELINE_EXCEPTIONS.some(
        ([exId, exFg, exBg]) => exId === id && exFg === fg && exBg === bg,
      );
      if (isBaselineException) continue;
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

  checkPrePaintScript(htmlPath, new Set(themes.keys()), failures);

  return failures;
}

const root = path.join(__dirname, "..");
const cssArg = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "dashboard-react", "src", "index.css");
const failures = run(
  cssArg,
  path.join(root, "electron", "src", "theme.ts"),
  path.join(root, "dashboard-react", "index.html"),
);

if (failures.length) {
  console.error("Theme token check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("Theme token check passed.");
