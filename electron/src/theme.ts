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
// quoted `"<id>"` substring, so an unquoted key it would otherwise leave
// undetected as missing.
export const WINDOW_CHROME: Record<string, { bg: string; titlebar: string; symbol: string }> = {
  "blossom": { bg: "#f5f0ff", titlebar: "#ffd9ea", symbol: "#7a5a92" },
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
