# Mobile Support for the Browser Version — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser version usable on a phone — legible charts, reachable modals, thumb-sized touch targets — without changing how the desktop app looks at its normal size.

**Architecture:** One shared component set adapted by width breakpoints (layout) and pointer-capability queries (affordances). The contour chart sizes its own viewBox from its measured container so it is legible at every width by construction. A Playwright audit script asserts the properties across eight viewports; it is written first and must fail before any fix lands.

**Tech Stack:** React 18 + TypeScript, Vite, plain CSS with custom properties, Playwright (already a devDependency of `dashboard-react`), plain-node scripts in `scripts/`.

**Spec:** `docs/specs/2026-08-18-mobile-responsive-design.md`

## Global Constraints

- **Desktop must not change at its normal size.** Layout changes are scoped to `max-width: 600px` / `max-width: 900px`; affordance changes to `(hover: none)` / `(pointer: coarse)`. Verified by Task 8, not assumed.
- **Touch target floor: 44x44 CSS px** under `(pointer: coarse)`.
- **SVG text floor: 8 px** on screen, computed as `fontSize * (renderedWidth / viewBoxWidth)`.
- **`dvh` needs a `vh` fallback.** Always emit the `100vh` declaration immediately before the `100dvh` one.
- **Never write fixture data into `dashboard-react/public/`.** `public/recordings.json` is tracked as `[]` and `electron/electron-builder.yml` filters that path out of the installer on purpose. Fixtures are injected into IndexedDB at runtime.
- **The browser build reads from IndexedDB**, database `euphonia-browser` version `2`, stores `recordings` / `audio` / `insights` / `details`, all `keyPath: "id"`. Detail rows are stored as `{...detail, id}`.
- **Colour rules still apply.** `dashboard-react/src/zones.ts` owns the meaning of zone colours (blue = deeper/masculine end, pink = feminine, butter = neutral). No task here changes a colour.
- **No Claude/AI attribution** in commit messages or code comments.

---

### Task 1: Make the seed generator exportable and inject it into IndexedDB

The generator currently writes into `public/`, which the spec forbids. Turn it into a module that *returns* takes, plus a helper that injects them into a live page.

**Files:**
- Modify: `scripts/seed_sample_data.mjs` (whole file — currently writes to `public/`)
- Create: `scripts/lib/seed_browser.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `makeTakes(): Recording[]` from `scripts/seed_sample_data.mjs` — five deterministic takes, each with a `detail` object attached as a non-enumerable-free plain property `__detail` (see below).
  - `seedBrowserData(page, takes): Promise<{recordings: number, details: number}>` from `scripts/lib/seed_browser.mjs` — injects into IndexedDB via `page.evaluate`.

- [ ] **Step 1: Change the generator to return data instead of writing files**

In `scripts/seed_sample_data.mjs`, keep `rng`, `FLOOR` and `makeTake` exactly as they are, with one change to `makeTake`: instead of `fs.writeFileSync(path.join(analysisDir, ...))`, attach the detail to the returned object.

Replace the `fs.writeFileSync(...detail...)` line with nothing, and in the returned object add:

```js
    __detail: detail, // the heavy per-take analysis; goes to the `details` store
```

Then replace everything from `fs.mkdirSync(analysisDir, ...)` to the end of the file with:

```js
export function makeTakes() {
  // Deliberately a progression: earliest take is the roughest, latest the best,
  // so the trend charts have a real shape instead of noise.
  return [
    makeTake(1, "Rainbow Passage, first try", "2026-07-02", 158, 0.18, 11),
    makeTake(2, "Rainbow Passage, morning", "2026-07-14", 168, 0.36, 22),
    makeTake(3, "Reading practice", "2026-07-28", 176, 0.55, 33),
    makeTake(4, "Rainbow Passage, warmed up", "2026-08-09", 184, 0.71, 44),
    makeTake(5, "Rainbow Passage, morning", "2026-08-16", 189, 0.83, 55),
  ];
}

// Running this file directly just prints what it would produce — a quick way to
// eyeball the fixture without launching a browser. It writes nothing: fixtures
// go into IndexedDB at runtime (see scripts/lib/seed_browser.mjs), never into
// public/, where recordings.json is tracked as [] and electron-builder
// deliberately filters the path out of the installer.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  for (const t of makeTakes()) {
    console.log(
      `#${t.id} ${t.label.padEnd(30)} mean ${t.pitch.mean_hz} Hz, ` +
        `${t.register.n_phrases} phrases, ${t.register.in_register_pct}% in register`,
    );
  }
}
```

Delete the now-unused `fs`, `path`, `fileURLToPath`, `root`, `pub`, `analysisDir` and the entire `--clean` block at the top.

- [ ] **Step 2: Verify the generator is deterministic and file-free**

Run:

```bash
cd "C:/GitHub Projects/Euphonia" && node scripts/seed_sample_data.mjs > /tmp/seed-a.txt && node scripts/seed_sample_data.mjs > /tmp/seed-b.txt && diff /tmp/seed-a.txt /tmp/seed-b.txt && echo IDENTICAL && git status --short
```

Expected: prints five lines, then `IDENTICAL`, and `git status --short` shows only `scripts/` changes — **no** `dashboard-react/public/` modifications. If `public/recordings.json` appears, Step 1 was incomplete.

- [ ] **Step 3: Write the IndexedDB injector**

Create `scripts/lib/seed_browser.mjs`:

```js
// Puts fixture takes into the browser build's IndexedDB.
//
// The browser build reads recordings from IndexedDB, not from
// public/recordings.json -- that path is only used when window.euphonia exists
// (see dashboard-react/src/App.tsx and src/browser/installBridge.ts). Anything
// that wants to render a populated dashboard in a browser has to write here.
//
// Schema mirrors dashboard-react/src/browser/db.ts: database "euphonia-browser"
// version 2, stores recordings/audio/insights/details, all keyPath "id".
// Detail rows are stored as {...detail, id}.

/**
 * @param {import('playwright').Page} page  a page already navigated to the app
 * @param {any[]} takes  from makeTakes(); each carries __detail
 * @returns {Promise<{recordings: number, details: number}>}
 */
export async function seedBrowserData(page, takes) {
  return page.evaluate(async (rows) => {
    const openDb = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("euphonia-browser", 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of ["recordings", "audio", "insights", "details"]) {
            if (!db.objectStoreNames.contains(s)) {
              db.createObjectStore(s, { keyPath: "id" });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const put = (db, store, value) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

    const db = await openDb();
    let details = 0;
    for (const row of rows) {
      const { __detail, ...rec } = row;
      await put(db, "recordings", rec);
      if (__detail) {
        await put(db, "details", { ...__detail, id: rec.id });
        details++;
      }
    }
    return { recordings: rows.length, details };
  }, takes);
}
```

- [ ] **Step 4: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add scripts/seed_sample_data.mjs scripts/lib/seed_browser.mjs && git commit -m "Seed fixtures into IndexedDB instead of public/

The browser build reads recordings from IndexedDB, so writing fixtures into
public/recordings.json populated nothing there -- and that file is tracked as
[], with electron-builder filtering the path out of the installer on purpose,
so generated takes had no business being written to it at all.

The generator now returns takes and a separate helper injects them."
```

---

### Task 2: Write the responsive audit and confirm it fails

The audit is the test for every fix that follows. It must be written first and must fail on the current code, or it is not testing anything.

**Files:**
- Create: `scripts/audit_responsive.mjs`

**Interfaces:**
- Consumes: `makeTakes()` (Task 1), `seedBrowserData()` (Task 1).
- Produces: an executable audit. Exit code 0 = all assertions pass; 1 = failures listed on stderr. Accepts `--url <base>` (default `http://localhost:4173/`) and `--json <path>` to dump raw measurements (used by Task 8).

- [ ] **Step 1: Write the audit script**

Create `scripts/audit_responsive.mjs`:

```js
// Asserts the responsive properties the mobile work is supposed to guarantee,
// across the widths where they have to hold. Plain assertions, not a pile of
// screenshots for a human to squint at -- same spirit as test_theme_tokens.js.
//
// Run:  cd dashboard-react && npm run build && npx vite preview --port 4173 &
//       node ../scripts/audit_responsive.mjs
//
// Playwright lives in dashboard-react/node_modules and Node resolves bare
// imports from THIS file's directory upward, so scripts/ needs a link to it:
//   New-Item -ItemType Junction -Path scripts/node_modules `
//            -Target dashboard-react/node_modules
// (both gitignored). Same gotcha as screenshot_themes.mjs -- see its header.
import { chromium, devices } from "playwright";
import fs from "node:fs";
import { makeTakes } from "./seed_sample_data.mjs";
import { seedBrowserData } from "./lib/seed_browser.mjs";

const TAP_MIN = 44; // CSS px, Apple HIG / Material floor
const SVG_TEXT_MIN = 8; // CSS px on screen

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const BASE_URL = argOf("--url", "http://localhost:4173/");
const JSON_OUT = argOf("--json", null);

// coarse:true emulates a touch device, which is what makes (pointer: coarse)
// and (hover: none) match -- verified in Chromium. The desktop-parity run in
// Task 8 uses coarse:false on purpose: coarse pointer legitimately grows hit
// areas at EVERY width, so a parity check made with it would report the
// feature working as if it were a regression.
const VIEWPORTS = [
  { name: "320x568 phone", width: 320, height: 568, coarse: true },
  { name: "375x812 phone", width: 375, height: 812, coarse: true },
  { name: "414x896 phone", width: 414, height: 896, coarse: true },
  { name: "812x375 phone landscape", width: 812, height: 375, coarse: true },
  { name: "600x960 narrow", width: 600, height: 960, coarse: true },
  { name: "768x1024 tablet", width: 768, height: 1024, coarse: true },
  { name: "1024x768 small desktop", width: 1024, height: 768, coarse: false },
  { name: "1280x900 desktop", width: 1280, height: 900, coarse: false },
];

// Runs in the page. Returns raw measurements; all judging happens in node so
// the thresholds live in one place.
function measure() {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const vh = de.clientHeight;

  const svgText = [];
  document.querySelectorAll("svg[viewBox]").forEach((svg) => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const vbW = parseFloat(svg.getAttribute("viewBox").split(/[ ,]+/)[2]);
    if (!vbW) return;
    const scale = r.width / vbW;
    svg.querySelectorAll("text").forEach((t) => {
      const fs =
        parseFloat(t.getAttribute("font-size") || getComputedStyle(t).fontSize) || 0;
      if (!fs) return;
      svgText.push({
        cls: svg.getAttribute("class") || "(none)",
        vbW,
        renderedW: Math.round(r.width),
        px: +(fs * scale).toFixed(2),
        sample: (t.textContent || "").trim().slice(0, 24),
      });
    });
  });

  const targets = [];
  document
    .querySelectorAll('button, a[href], input, select, [role="button"]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return; // not rendered
      if (getComputedStyle(el).visibility === "hidden") return;
      targets.push({
        cls: el.getAttribute("class") || "(none)",
        w: Math.round(r.width),
        h: Math.round(r.height),
        label: (el.textContent || "").trim().slice(0, 20),
      });
    });

  const modals = [];
  document.querySelectorAll(".mm-card, .modal").forEach((m) => {
    const r = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    modals.push({
      cls: m.className,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      scrollable: m.scrollHeight > m.clientHeight + 1,
      overflowY: cs.overflowY,
      fits: r.top >= 0 && r.bottom <= vh,
    });
  });

  return {
    viewport: { w: vw, h: vh },
    scrollWidth: de.scrollWidth,
    overflowBy: de.scrollWidth - vw,
    media: {
      hoverNone: matchMedia("(hover: none)").matches,
      pointerCoarse: matchMedia("(pointer: coarse)").matches,
    },
    recDeleteOpacity: (() => {
      const el = document.querySelector(".rec-delete");
      return el ? +getComputedStyle(el).opacity : null;
    })(),
    svgText,
    targets,
    modals,
  };
}

// Opens the first expandable stat card. A synthetic .click() is no good here:
// it bubbles to the document with no preceding mousedown, which trips the
// close-on-outside-click path and the modal shuts immediately. The card is
// keyboard-activatable (role=button, Enter/Space), so drive it that way.
async function openMetricModal(page) {
  const card = page.locator(".stat.is-clickable").first();
  if (!(await card.count())) return false;
  await card.focus();
  await page.keyboard.press("Enter");
  try {
    await page.waitForSelector(".mm-card", { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

const failures = [];
const results = [];
const fail = (vp, msg) => failures.push(`[${vp}] ${msg}`);

const browser = await chromium.launch();
const takes = makeTakes();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.coarse ? { ...devices["Pixel 5"], viewport: { width: vp.width, height: vp.height } } : {}),
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await seedBrowserData(page, takes);
  await page.reload();
  await page.waitForSelector(".stat", { timeout: 15000 });
  await page.waitForTimeout(400);

  const m = await page.evaluate(measure);

  // Assertion 0: the emulation is actually doing what the run assumes.
  if (vp.coarse && !m.media.pointerCoarse) {
    fail(vp.name, "expected (pointer: coarse) to match under touch emulation; it did not -- every coarse-pointer assertion below is meaningless");
  }
  if (!vp.coarse && m.media.pointerCoarse) {
    fail(vp.name, "expected a fine pointer; got coarse");
  }

  // Assertion 1: no horizontal overflow.
  if (m.overflowBy > 0) {
    fail(vp.name, `horizontal overflow by ${m.overflowBy}px (scrollWidth ${m.scrollWidth} vs ${m.viewport.w})`);
  }

  // Assertion 2: SVG text legible on screen.
  for (const t of m.svgText) {
    if (t.px < SVG_TEXT_MIN) {
      fail(vp.name, `svg text ${t.px}px < ${SVG_TEXT_MIN}px in ${t.cls} (viewBox ${t.vbW} rendered ${t.renderedW}) "${t.sample}"`);
    }
  }

  // Assertion 3: touch targets, only where a coarse pointer is in play.
  if (vp.coarse) {
    for (const t of m.targets) {
      if (t.w < TAP_MIN || t.h < TAP_MIN) {
        fail(vp.name, `tap target ${t.w}x${t.h} < ${TAP_MIN} on .${t.cls.split(" ")[0]} "${t.label}"`);
      }
    }
  }

  // Assertion 5: hover-only affordances resolve on touch.
  if (vp.coarse && m.recDeleteOpacity !== null && m.recDeleteOpacity < 0.9) {
    fail(vp.name, `.rec-delete rests at opacity ${m.recDeleteOpacity} under (hover: none); it never becomes legible on touch`);
  }

  // Assertion 4: an open modal is on screen or scrollable to its end.
  const opened = await openMetricModal(page);
  let modalState = null;
  if (opened) {
    modalState = await page.evaluate(measure);
    for (const mod of modalState.modals) {
      if (!mod.fits && !mod.scrollable) {
        fail(vp.name, `${mod.cls} is clipped (top ${mod.top}, bottom ${mod.bottom}, viewport ${modalState.viewport.h}) and cannot scroll (overflow-y: ${mod.overflowY})`);
      }
    }
    if (modalState.overflowBy > 0) {
      fail(vp.name, `horizontal overflow by ${modalState.overflowBy}px while a modal is open`);
    }
    if (vp.coarse) {
      for (const t of modalState.targets) {
        if (t.w < TAP_MIN || t.h < TAP_MIN) {
          fail(vp.name, `tap target ${t.w}x${t.h} < ${TAP_MIN} on .${t.cls.split(" ")[0]} "${t.label}" (modal open)`);
        }
      }
    }
  } else {
    fail(vp.name, "could not open a metric modal, so modal assertions did not run");
  }

  results.push({ viewport: vp.name, base: m, modal: modalState });
  console.log(`checked ${vp.name}`);
  await context.close();
}

await browser.close();

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
  console.log(`raw measurements -> ${JSON_OUT}`);
}

if (failures.length) {
  console.error(`\nResponsive audit FAILED (${failures.length}):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("\nResponsive audit passed.");
```

- [ ] **Step 2: Link playwright so `scripts/` can import it, then build and serve**

```bash
cd "C:/GitHub Projects/Euphonia" && powershell -NoProfile -Command "if (-not (Test-Path scripts/node_modules)) { New-Item -ItemType Junction -Path scripts/node_modules -Target dashboard-react/node_modules | Out-Null }" && cd dashboard-react && npm run build
```

Then start the preview server in the background:

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && (npx vite preview --port 4173 > /tmp/euph-preview.log 2>&1 &) ; sleep 6 ; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/
```

Expected: `200`.

- [ ] **Step 3: Run the audit and confirm it FAILS on today's code**

Run: `cd "C:/GitHub Projects/Euphonia" && node scripts/audit_responsive.mjs`

Expected: **exit 1**, with failures including all of:
- `svg text 3.0px < 8px in contour` at 375x812
- `svg text ... in contour` at 768x1024 too (about 6.8 px — the problem is not phone-only)
- `.mm-card is clipped ... and cannot scroll (overflow-y: visible)` at 812x375
- `tap target 34x34 < 44 on .theme-toggle` and `.settings-btn`
- `tap target 3x16 < 44 on .mm-ref-stem` (modal open)
- `.rec-delete rests at opacity 0.55 under (hover: none)`

If any of those is **absent**, the audit is not measuring what it claims — fix the audit before going further. In particular, if no failures appear at all, check assertion 0 passed and that `.stat` cards actually rendered (the seed worked).

- [ ] **Step 4: Record the baseline**

```bash
cd "C:/GitHub Projects/Euphonia" && node scripts/audit_responsive.mjs --json /tmp/audit-before.json 2>&1 | tail -30
```

Keep `/tmp/audit-before.json`; Task 8 diffs the 1280 desktop rows against it.

- [ ] **Step 5: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add scripts/audit_responsive.mjs && git commit -m "Add a responsive audit across eight viewports

Asserts no horizontal overflow, an 8px floor on rendered SVG text, a 44px
touch-target floor under a coarse pointer, and that an open modal is always
either fully visible or scrollable to its end.

Currently fails, which is the point -- it reproduces every defect the mobile
spec measured, including chart labels at 3px and a metric modal clipped 74px
off-screen in landscape with no way to scroll to it."
```

---

### Task 3: Make the contour chart size itself from its container

**Files:**
- Modify: `dashboard-react/src/components/ContourChart.tsx:16-18` (the `W` / `H` / `pad` constants and the component signature)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports. `ContourChart` keeps its existing props (`{ detail, femThreshold? }`).

- [ ] **Step 1: Add container measurement**

In `ContourChart.tsx`, add to the imports at the top:

```tsx
import { useEffect, useRef, useState } from "react";
```

Then replace the line `  const W = 900;` with:

```tsx
  // The viewBox tracks the rendered width so the scale stays near 1:1 and the
  // 9-10 unit labels below land at 9-10 real pixels. A fixed 900 made them
  // 3px on a phone and 6.8px on a 768px tablet -- everything in here derives
  // from W/H/pad, so sizing W is enough to fix all of it at once.
  //
  // Above 900px rendered, W stays 900: that is exactly what desktop ships
  // today, so widening the window changes nothing. 900 is also where the two
  // branches agree (scale 1.0), so there is no jump at the boundary.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(900);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.getBoundingClientRect().width;
      // 0 happens while the element is display:none (a collapsed section);
      // keep the last good value rather than collapsing the chart.
      if (w > 0) setBoxW(Math.max(260, Math.min(900, Math.round(w))));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = boxW;
```

- [ ] **Step 2: Wrap the SVG in the measured element**

Replace the opening line:

```tsx
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="contour">
```

with:

```tsx
    <div ref={wrapRef} className="contour-wrap">
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="contour">
```

and replace the closing `</svg>` at the end of the component with:

```tsx
    </svg>
    </div>
```

- [ ] **Step 3: Give the wrapper a width to measure**

Add to `dashboard-react/src/index.css`, immediately before the existing `svg.contour` rules if any exist, otherwise at the end of the contour section:

```css
/* The contour chart measures this box to choose its viewBox (see
   ContourChart.tsx). It must be a plain full-width block: if it ever became
   inline or shrink-to-fit, the chart would measure its own output and the
   width would oscillate. */
.contour-wrap {
  display: block;
  width: 100%;
}
```

- [ ] **Step 4: Rebuild and run the audit**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && npm run build && cd .. && node scripts/audit_responsive.mjs 2>&1 | tail -30
```

Expected: **every `svg text ... in contour` failure is gone** at all eight viewports. Other failures (tap targets, modal clipping, `.rec-delete`) still remain — later tasks. If a *new* overflow failure appears, the wrapper is not full-width; recheck Step 3.

- [ ] **Step 5: Confirm desktop is untouched**

```bash
cd "C:/GitHub Projects/Euphonia" && node -e "
const b=require('/tmp/audit-before.json');
const r=b.find(x=>x.viewport.startsWith('1280'));
const c=r.base.svgText.filter(t=>t.cls.includes('contour'));
console.log('before 1280: viewBox',c[0].vbW,'rendered',c[0].renderedW,'text',c[0].px+'px');
"
```

Then compare against the same row from a fresh run:

```bash
cd "C:/GitHub Projects/Euphonia" && node scripts/audit_responsive.mjs --json /tmp/audit-t3.json > /dev/null 2>&1; node -e "
const a=require('/tmp/audit-t3.json');
const r=a.find(x=>x.viewport.startsWith('1280'));
const c=r.base.svgText.filter(t=>t.cls.includes('contour'));
console.log('after  1280: viewBox',c[0].vbW,'rendered',c[0].renderedW,'text',c[0].px+'px');
"
```

Expected: both report `viewBox 900` and the same rendered width. If the after-run shows a viewBox below 900 at 1280, the clamp in Step 1 is wrong.

- [ ] **Step 6: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add dashboard-react/src/components/ContourChart.tsx dashboard-react/src/index.css && git commit -m "Size the contour chart's viewBox from its container

A fixed 900-unit viewBox scaled by CSS shrank the labels with it: 3px on a
phone, 6.8px on a 768px tablet. It needed 800px of render to clear an 8px
floor, so everything below roughly a 1050px viewport was illegible -- a
breakpoint would have missed the tablet.

The viewBox now tracks the measured width, capped at 900. Above that the
chart is exactly what desktop ships today, and 900 is where both branches
agree, so nothing jumps at the boundary."
```

---

### Task 4: Make the metric modal reachable, and fix the viewport unit

**Files:**
- Modify: `dashboard-react/src/index.css:1779-1789` (`.mm-card`)
- Modify: `dashboard-react/src/index.css:2154-2162` (`.modal`, the `max-height` line)

**Interfaces:**
- Consumes: nothing. Produces: nothing importable.

- [ ] **Step 1: Cap and scroll `.mm-card`**

In `dashboard-react/src/index.css`, in the `.mm-card` block, add after `width: min(640px, 100%);`:

```css
  /* Without a cap this overflows the fold in landscape -- measured at 802x375
     it ran 74px past the bottom with overflow-y: visible on both the card and
     its backdrop, so the content was simply unreachable. 40px is exactly the
     vertical padding of .mm-backdrop (20px each side). dvh, not vh: on iOS
     Safari 100vh is the large viewport and ignores the collapsing toolbar. */
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  overscroll-behavior: contain;
```

- [ ] **Step 2: Fix the unit on `.modal`**

In the `.modal` block, replace the single line `  max-height: calc(100vh - 40px);` with:

```css
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
```

- [ ] **Step 3: Rebuild and run the audit**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && npm run build && cd .. && node scripts/audit_responsive.mjs 2>&1 | tail -25
```

Expected: the `.mm-card is clipped ... cannot scroll` failure at `812x375 phone landscape` is gone. Tap-target and `.rec-delete` failures remain.

- [ ] **Step 4: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add dashboard-react/src/index.css && git commit -m "Let the metric modal scroll, and use dvh for modal height

In landscape the metric card ran 74px past the bottom of the screen with
overflow-y: visible on both it and its backdrop, so that content could not be
reached at all. It now gets the cap and scroll .modal already had.

Both modals now cap with dvh, with the vh line kept before it as a fallback:
on iOS Safari 100vh measures the large viewport and ignores the collapsing
toolbar, so a vh-capped modal is taller than the screen it sits on."
```

---

### Task 5: Touch targets

**Files:**
- Modify: `dashboard-react/src/index.css` (append a new touch section near the end, before the final `@media (prefers-reduced-motion: reduce)` block)

**Interfaces:**
- Consumes: nothing. Produces: nothing importable.

- [ ] **Step 1: Add the coarse-pointer block**

Append to `dashboard-react/src/index.css`:

```css
/* ---- touch targets ----
   Keyed off the pointer, not the viewport: a 34px button is fine under a mouse
   at any width and wrong under a thumb at any width. This never matches a
   normal desktop, which is what keeps the desktop app unchanged.
   44px is the Apple HIG / Material floor. Hit areas grow; nothing visual does,
   so the design is untouched. */
@media (pointer: coarse) {
  .settings-btn,
  .theme-toggle,
  .mm-close,
  .rec-delete,
  .player .play,
  .player .dl {
    min-width: 44px;
    min-height: 44px;
  }

  /* The reference markers sit ON a measurement scale -- a 3px stem is the
     mark, and widening it would misstate where the voice actually falls. So
     the mark keeps its size and an invisible pseudo-element takes the taps. */
  .mm-ref {
    /* the stem is 3x16; the pad has to come from somewhere that does not
       affect layout, hence the absolutely-positioned overlay below */
    z-index: 1;
  }
  .mm-ref::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
}
```

- [ ] **Step 2: Rebuild and run the audit**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && npm run build && cd .. && node scripts/audit_responsive.mjs 2>&1 | tail -25
```

Expected: `tap target ... < 44` failures are gone for `.settings-btn`, `.theme-toggle`, `.mm-close`, `.rec-delete`.

**The `.mm-ref-stem` failure will probably remain**, because the audit measures the element's own box and a `::after` overlay does not change it. This is a real limitation of the assertion, not of the fix. Resolve it in Step 3 rather than by weakening the check.

- [ ] **Step 3: Teach the audit to credit an expanded hit area**

The assertion should measure what a finger can actually hit. In `scripts/audit_responsive.mjs`, inside `measure()`, replace the `targets.push({...})` call with:

```js
      // An element can widen its hit area with a pseudo-element overlay without
      // changing its own box (see .mm-ref::after -- the visual mark has to stay
      // 3px because it marks a position on a scale). Credit that overlay.
      const after = getComputedStyle(el, "::after");
      const hasOverlay = after.content !== "none" && after.position === "absolute";
      const ow = hasOverlay ? parseFloat(after.width) || 0 : 0;
      const oh = hasOverlay ? parseFloat(after.height) || 0 : 0;
      targets.push({
        cls: el.getAttribute("class") || "(none)",
        w: Math.round(Math.max(r.width, ow)),
        h: Math.round(Math.max(r.height, oh)),
        label: (el.textContent || "").trim().slice(0, 20),
      });
```

- [ ] **Step 4: Check the marker is actually a tappable element**

The overlay only helps if `.mm-ref` is the interactive element. Confirm:

```bash
cd "C:/GitHub Projects/Euphonia" && grep -rn "mm-ref" dashboard-react/src/components/MetricModal.tsx | head
```

If the clickable element is `.mm-ref-stem` (or a `<button>` inside `.mm-ref`) rather than `.mm-ref` itself, move the `::after` rule onto whichever element the audit reports in its failure message, and make sure that element is `position: relative` so the absolute overlay anchors to it.

- [ ] **Step 5: Rerun the audit**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && npm run build && cd .. && node scripts/audit_responsive.mjs 2>&1 | tail -25
```

Expected: all tap-target failures gone at all coarse viewports. Only `.rec-delete` opacity remains.

- [ ] **Step 6: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add dashboard-react/src/index.css scripts/audit_responsive.mjs && git commit -m "Give touch pointers 44px hit areas

Fourteen controls sat under the 44px floor -- the theme and settings buttons
at 34 square, the modal close at 26, and the reference markers at 3x16, which
play preview clips and were essentially untappable.

Keyed off (pointer: coarse) rather than width, since a 34px button is wrong
under a thumb at any width and fine under a mouse at any width. Only hit areas
grow. The reference markers keep their 3px stems -- they mark a position on a
measurement scale, so widening the mark would misstate the reading -- and take
taps through an invisible overlay instead, which the audit now credits."
```

---

### Task 6: Hover affordances on touch

**Files:**
- Modify: `dashboard-react/src/index.css` (append, next to the touch block from Task 5)

**Interfaces:**
- Consumes: nothing. Produces: nothing importable.

- [ ] **Step 1: Audit what hover actually hides**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react/src" && grep -n -A6 ":hover" index.css | grep -E ":hover|opacity:|visibility:|display:|content:" | head -40
```

Read the output. Any rule where `:hover` changes `opacity`, `visibility`, `display` or `content` is hiding information until hover and needs a touch equivalent. Rules that only change `background`, `border-color`, `transform` or `box-shadow` are decoration and need nothing.

- [ ] **Step 2: Add the touch block**

Append to `dashboard-react/src/index.css`:

```css
/* ---- affordances that hover was doing the work for ----
   (hover: none) means no pointer can ever hover here, so anything resting in a
   dimmed "discover me by hovering" state stays dimmed forever. Decorative
   hover states (background, transform, shadow) need no equivalent and are
   deliberately not listed. */
@media (hover: none) {
  .rec-delete {
    opacity: 1;
  }
}
```

Add any further selectors Step 1 turned up, each with its resting state resolved the same way.

- [ ] **Step 3: Rebuild and run the audit**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && npm run build && cd .. && node scripts/audit_responsive.mjs 2>&1 | tail -20
```

Expected: **`Responsive audit passed.`** and exit 0. If anything remains, fix it before committing.

- [ ] **Step 4: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add dashboard-react/src/index.css && git commit -m "Resolve hover-only affordances on touch

The per-recording delete button rested at opacity 0.55 and only reached full
strength on hover, which never fires on a touch screen -- so on a phone it was
permanently half-visible. Decorative hover states are left alone: they have
nothing to reveal."
```

---

### Task 7: Layout review — add breakpoints only where something actually reads badly

**Read this before writing any CSS.** The four grids in the app already use
`repeat(auto-fit, minmax(Npx, 1fr))`:

| grid | min column | collapses to 1 column below |
|---|---|---|
| `.stat-grid` (index.css:965) | 230px | 230px |
| `.chart-grid` (index.css:1117) | 300px | 300px |
| `.gloss` (index.css:1402) | 250px | 250px |
| `.rec-grid` (index.css:1141) | already `1fr` | always one column |

`auto-fit` collapses these on its own, which is exactly why the audit finds no
overflow at 320px. **The width breakpoints the spec anticipated may turn out to
be unnecessary.** That is a good outcome, not a gap — do not add a
`max-width: 600px` block just because the spec mentioned one. Add CSS only
where this task's review finds something concretely wrong, and write down what
it was.

**Files:**
- Modify: `dashboard-react/src/index.css` (only if the review finds a problem)

**Interfaces:**
- Consumes: nothing. Produces: nothing importable.

- [ ] **Step 1: Measure how the grids actually resolve at phone widths**

```bash
cd "C:/GitHub Projects/Euphonia" && node scripts/audit_responsive.mjs --json /tmp/audit-t7.json > /dev/null 2>&1; node -e "
const a=require('/tmp/audit-t7.json');
for (const r of a) {
  const t=r.base.targets.length, s=r.base.svgText.length;
  console.log(r.viewport.padEnd(26), 'viewport', JSON.stringify(r.base.viewport), 'overflow', r.base.overflowBy, '| targets', t, '| svg texts', s);
}
"
```

Expected: `overflow 0` on every row. Any non-zero value is a real bug — fix it here.

- [ ] **Step 2: Look at the populated dashboard at 375px yourself**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && (npx vite preview --port 4173 > /tmp/euph-preview.log 2>&1 &) ; sleep 6 ; echo "open http://localhost:4173/ at 375px wide with devtools device emulation"
```

Seed the page (paste into the devtools console, then reload):

```js
await (await import('/src/browser/db.ts')).clearAll?.().catch(()=>{});
```

or simply run the audit once against this server, which leaves the IndexedDB
fixture in place for the profile it used.

Check specifically, and write down the answer to each:
1. Do the stat cards stack to one column, or is there an awkward two-column squeeze?
2. Is the record panel (`.record-panel`, index.css:~900) usable — label field and buttons not cramped?
3. Does the header wrap sensibly, with the theme toggle and settings button reachable?
4. Do the phrase-landing dots in the contour chart overlap at narrow widths?
5. Do the two bottom labels in the contour chart (`time →` and `● dots = how each phrase landed`) collide at 320px?

Items 4 and 5 are the ones the audit cannot see: it checks text *size*, not text *collision*.

- [ ] **Step 3: Fix only what Step 2 found**

For each problem found, add a rule under a `@media (max-width: 600px)` block appended to `index.css`, with a comment naming the specific symptom. If Step 2 found nothing, add **no CSS** and say so in the commit.

For item 5 specifically, if the labels collide, the fix is in `ContourChart.tsx`: drop the right-hand label below a viewBox width of 380, since it is a legend rather than data:

```tsx
      {W >= 380 && (
        <text x={W - pad.r} y={H - 6} fontSize="10" fill={colors.inkSoft} textAnchor="end">
          ● dots = how each phrase landed
        </text>
      )}
```

- [ ] **Step 4: Rerun the audit**

```bash
cd "C:/GitHub Projects/Euphonia/dashboard-react" && npm run build && cd .. && node scripts/audit_responsive.mjs 2>&1 | tail -20
```

Expected: `Responsive audit passed.`

- [ ] **Step 5: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add -A dashboard-react/src && git commit -m "Review the phone layout and fix what the audit cannot see

<Replace this line with what the review actually found. If the auto-fit grids
already handled every width and nothing needed changing, say exactly that --
'no CSS added; the four auto-fit grids collapse on their own' is a real and
useful result, and better than inventing breakpoints to look busy.>"
```

---

### Task 8: Prove desktop is unchanged, and correct the docs

**Files:**
- Modify: `README.md` (the **Mobile:** paragraph in the browser-version section)
- Modify: `docs/specs/2026-08-18-mobile-responsive-design.md` (append an outcome note)

**Interfaces:**
- Consumes: `/tmp/audit-before.json` (Task 2 Step 4).
- Produces: nothing importable.

- [ ] **Step 1: Diff the desktop rows against the pre-work baseline**

```bash
cd "C:/GitHub Projects/Euphonia" && node scripts/audit_responsive.mjs --json /tmp/audit-after.json > /dev/null 2>&1; node -e "
const before=require('/tmp/audit-before.json'), after=require('/tmp/audit-after.json');
// Only the fine-pointer rows can be compared: coarse-pointer runs legitimately
// grow hit areas at every width, which is the feature, not a regression.
for (const name of ['1024x768 small desktop','1280x900 desktop']) {
  const b=before.find(x=>x.viewport===name), a=after.find(x=>x.viewport===name);
  const norm=r=>JSON.stringify({overflow:r.base.overflowBy, targets:r.base.targets.map(t=>[t.cls,t.w,t.h]), svg:r.base.svgText.map(t=>[t.cls,t.vbW,t.renderedW,t.px])});
  console.log(name, norm(b)===norm(a) ? 'IDENTICAL' : 'CHANGED');
  if (norm(b)!==norm(a)) {
    const bt=new Map(b.base.targets.map(t=>[t.cls+t.label,[t.w,t.h]]));
    for (const t of a.base.targets) { const p=bt.get(t.cls+t.label); if (p && (p[0]!==t.w||p[1]!==t.h)) console.log('   target', t.cls.split(' ')[0], p.join('x'), '->', t.w+'x'+t.h); }
    const bs=new Map(b.base.svgText.map(t=>[t.cls+t.sample,t.px]));
    for (const t of a.base.svgText) { const p=bs.get(t.cls+t.sample); if (p!==undefined && p!==t.px) console.log('   svg text', t.cls, p+'px ->', t.px+'px'); }
  }
}
"
```

Expected: `IDENTICAL` for both desktop rows.

If it reports `CHANGED`, read the printed diff before assuming it is a bug — then either fix the leak (a rule that was supposed to be behind a capability query but is not) or, if the change is genuinely intended, record it explicitly in Step 3 rather than letting it pass silently.

- [ ] **Step 2: Correct the README's mobile claim**

The current paragraph says the layout and record flow "have both been tested on
phone-sized screens" and that only microphone capture is unverified. That was
too generous — the populated dashboard had never been reviewed at any width.
Replace the **Mobile:** paragraph in `README.md` with:

```markdown
**Mobile:** the layout, the record → analyze → results flow, and the populated
dashboard have been checked at phone and tablet viewports, down to 320px wide,
with an automated audit (`scripts/audit_responsive.mjs`) covering horizontal
overflow, chart label legibility, touch target sizes and modal reachability.
That audit runs in browser viewport emulation, which is not the same as a real
handset — it can't tell you how iOS Safari's collapsing toolbar behaves or how
the record button falls under a thumb. Microphone capture in particular hasn't
been verified on physical hardware. If something misbehaves on your device,
[open an issue](../../issues).
```

- [ ] **Step 3: Record the outcome in the spec**

Append to `docs/specs/2026-08-18-mobile-responsive-design.md`:

```markdown
## Outcome

Implemented 2026-08-18. All eight audit viewports pass; both desktop rows are
byte-identical to the pre-work baseline under a fine pointer.

<Add here: whether Task 7 needed any width breakpoints at all, and any defect
found during implementation that the design did not anticipate. If the
auto-fit grids meant no width breakpoint was ever added, say so plainly — the
spec anticipated two, and a reader deserves to know they proved unnecessary.>

Still unverified, and not verifiable this way: anything requiring physical
hardware. See the Verification section.
```

- [ ] **Step 4: Final full check**

```bash
cd "C:/GitHub Projects/Euphonia" && node scripts/test_theme_tokens.js && node scripts/audit_responsive.mjs 2>&1 | tail -5 && cd dashboard-react && npx tsc -b --noEmit 2>&1 | tail -5 && echo "ALL GREEN"
```

Expected: theme token check passes (the mobile work must not have disturbed the
eight themes), responsive audit passes, TypeScript compiles clean.

- [ ] **Step 5: Confirm no fixture data leaked into the repo**

```bash
cd "C:/GitHub Projects/Euphonia" && git status --short && cat dashboard-react/public/recordings.json && ls dashboard-react/public/analysis/
```

Expected: `recordings.json` still contains exactly `[]`, and `public/analysis/`
holds only `.gitkeep`. If either shows fixture data, remove it — that path is
filtered out of the installer precisely so nobody's voice data ships.

- [ ] **Step 6: Commit**

```bash
cd "C:/GitHub Projects/Euphonia" && git add README.md docs/specs/2026-08-18-mobile-responsive-design.md && git commit -m "Record the mobile outcome and correct the README's claim

The README said phone-sized screens had been tested and only microphone
capture was unverified. The populated dashboard had in fact never been looked
at, at any width -- recordings.json ships as [] and the theme screenshots
captured an empty page, which is how chart labels rendering at 3px went
unnoticed.

It now says what was actually checked, by what, and states plainly that
viewport emulation is not a handset."
```

---

## Self-Review

Checked against `docs/specs/2026-08-18-mobile-responsive-design.md`:

**Spec coverage.** Every numbered problem maps to a task: contour legibility → Task 3; modal clipping → Task 4; `.mm-ref` hit boxes → Task 5; touch targets → Task 5; `100vh`/`dvh` → Task 4; hover affordance → Task 6. Sample data → Task 1. Verification → Task 2 (written first, must fail) and Task 8 (desktop parity). The spec's non-goals are respected: no mobile-only components, no fluid-token rewrite, no section navigation.

**One deliberate deviation from the spec, already folded back into it.** The spec originally proposed a fixed ~380-unit viewBox below a phone breakpoint. Measuring at 375 / 768 / 1280 showed no single constant works and that the failure extends to tablets, so Task 3 measures the container instead. The spec's Contour chart section, its Breakpoints list and its Risks list were all corrected before this plan was written.

**A second, smaller deviation.** The spec assumed width breakpoints for layout stacking. The four grids already use `auto-fit`, so Task 7 is written as a review that adds CSS only if something is genuinely wrong, and explicitly permits "no CSS added" as the result.

**Placeholder scan.** No TBD/TODO. Three steps intentionally contain author-supplied text rather than fixed content — Task 7 Step 5's commit body, Task 8 Step 3's outcome note, and any extra selectors Task 6 Step 1 turns up. Each is marked with angle brackets and says what belongs there; these are findings that cannot be known before the work is done, not unwritten plan.

**Type and name consistency.** `makeTakes()` (Task 1) is imported by Task 2. `seedBrowserData(page, takes)` (Task 1) is called in Task 2's viewport loop. The `__detail` property set in Task 1 Step 1 is the same one destructured in Task 1 Step 3. `measure()` is defined once in Task 2 and modified once in Task 5 Step 3; `targets[]` keeps the same `{cls, w, h, label}` shape in both. The `--json` flag added in Task 2 is consumed in Tasks 3, 7 and 8.

**Known weakness, stated rather than hidden.** Task 5 Step 4 depends on which element actually carries the click for a reference marker, which the plan does not settle — it tells the implementer how to find out and what to do in either case. That is a genuine unknown at planning time, not an omission.