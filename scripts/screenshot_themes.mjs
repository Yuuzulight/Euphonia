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
//
// Two environment gotchas the run line above doesn't cover:
//  1. Playwright's browser binaries aren't vendored -- if chromium.launch()
//     throws, run `npx playwright install chromium` once (inside
//     dashboard-react/, where the playwright package lives).
//  2. "playwright" is a devDependency of dashboard-react/ only, and Node
//     resolves this file's bare imports from ITS OWN directory (scripts/),
//     walking up scripts/'s ancestors -- cwd doesn't factor in. If there's
//     no node_modules above scripts/ that provides "playwright", the import
//     404s regardless of which directory you `cd` into first. Bridge it with
//     a junction for the run: `New-Item -ItemType Junction -Path
//     scripts/node_modules -Target dashboard-react/node_modules` (both are
//     gitignored, so this doesn't touch anything tracked).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const BASE_URL = process.env.EUPHONIA_URL || "http://localhost:4173/";
const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "..", "screenshots");

// Mirrors dashboard-react/src/theme/themes.ts. loadPref() validates `light`
// against LIGHT_THEMES and `dark` against DARK_THEMES independently, so
// `mode` has to match the theme's actual family or the id under test fails
// its own field's validation and silently falls back to the default theme.
const LIGHT_THEMES = ["blossom", "paper", "light-mint"];

const THEMES = [
  "blossom", "paper", "light-mint",
  "dusk-plum", "dark-mint", "midnight", "cocoa", "amber-night",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
fs.mkdirSync(outDir, { recursive: true });

for (const theme of THEMES) {
  const mode = LIGHT_THEMES.includes(theme) ? "light" : "dark";
  await page.goto(BASE_URL);
  await page.evaluate(({ t, mode }) => {
    localStorage.setItem(
      "euphonia:theme",
      JSON.stringify({ mode, light: t, dark: t }),
    );
  }, { t: theme, mode });
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
