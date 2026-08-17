import fs from "node:fs";
import path from "node:path";
import { nativeTheme } from "electron";
import { getUserDataRoot } from "./paths";

// Main creates the window before the renderer exists, so it can't read the
// CSS tokens. These three colors per theme are a deliberate duplicate of
// --bg-base / --titlebar-bg / --titlebar-ink in dashboard-react/src/index.css
// — the same trade as zones.ts. scripts/test_theme_tokens.js fails if a theme
// exists in the css but not here.
// Keys are quoted even where a bare identifier would do (e.g. "blossom") —
// scripts/test_theme_tokens.js's cross-file check greps this file for a
// `"<id>": {` object-key pattern, so an unquoted key it would otherwise
// leave undetected as missing.
export const WINDOW_CHROME: Record<string, { bg: string; titlebar: string; symbol: string }> = {
  "blossom": { bg: "#f5f0ff", titlebar: "#ffd9ea", symbol: "#785990" },
  "paper": { bg: "#f2efe8", titlebar: "#ece4d6", symbol: "#5c554a" },
  "light-mint": { bg: "#eef6f2", titlebar: "#cfeee0", symbol: "#365f4d" },
  "dusk-plum": { bg: "#14131f", titlebar: "#251d33", symbol: "#c8b6dd" },
  "dark-mint": { bg: "#0f1614", titlebar: "#1b2a24", symbol: "#a9c9ba" },
  "midnight": { bg: "#0d1322", titlebar: "#141c30", symbol: "#a8b6d4" },
  "cocoa": { bg: "#16110f", titlebar: "#241b17", symbol: "#cdb5a5" },
  "amber-night": { bg: "#131007", titlebar: "#1f1810", symbol: "#d8bd8a" },
};

function cachePath(): string {
  return path.join(getUserDataRoot(), "theme.json");
}

// WINDOW_CHROME is a plain object literal, so bracket access with an
// attacker- or corrupt-cache-controlled string is not safe to test with plain
// truthiness: `WINDOW_CHROME["__proto__"]` resolves to Object.prototype (and
// "constructor"/"toString"/etc. resolve to other inherited members), all of
// which are genuinely truthy and not nullish, so `id && WINDOW_CHROME[id]`
// and `WINDOW_CHROME[id] ?? fallback` both let those ids slip through as if
// they were real themes — and Object.prototype has no .bg/.titlebar/.symbol,
// so it hands Electron `undefined` colors. Object.hasOwn checks only the
// object's own keys, never the prototype chain, so it closes that hole.
function isThemeId(id: string): boolean {
  return Object.hasOwn(WINDOW_CHROME, id);
}

// A disposable cache of the renderer's choice, read once at startup so the
// window is created already wearing the right colors. Never the source of
// truth — the renderer's localStorage is.
export function readCachedTheme(): string {
  try {
    const raw = fs.readFileSync(cachePath(), "utf8");
    const id = (JSON.parse(raw) as { theme?: string }).theme;
    if (id && isThemeId(id)) return id;
  } catch {
    // missing or corrupt — fall through to the OS preference
  }
  return nativeTheme.shouldUseDarkColors ? "dusk-plum" : "blossom";
}

export function writeCachedTheme(id: string): void {
  if (!isThemeId(id)) return;
  try {
    fs.mkdirSync(getUserDataRoot(), { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify({ theme: id }));
  } catch {
    // a failed cache write costs one flash at next launch, nothing more
  }
}

export function chromeFor(id: string) {
  return isThemeId(id) ? WINDOW_CHROME[id] : WINDOW_CHROME.blossom;
}
