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

// Enumerated exceptions to the width half of the floor, with the reason they
// cannot meet it. Height is still asserted for these. Keep this list short and
// justify every entry -- it is a statement about geometry, not a way to quiet
// the check.
const NARROW_TARGET_EXCEPTIONS = [
  // Reference markers sit on a measurement scale, adjacent pairs measured as
  // close as 0.6px apart; a 44px-wide hit area would eat its neighbours.
  // Widening the visible mark is not an option either -- it encodes a position.
  "mm-ref",
];

// A target fails the floor if its height is under TAP_MIN, or its width is
// under TAP_MIN and it is not one of the enumerated narrow-target exceptions
// above. Both dimensions stay in the message either way, so an exempted
// element's actual width is never hidden from the output.
function tapTargetFails(t) {
  const cls0 = t.cls.split(" ")[0];
  const widthExempt = NARROW_TARGET_EXCEPTIONS.includes(cls0);
  return (t.w < TAP_MIN && !widthExempt) || t.h < TAP_MIN;
}

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
      // An element can widen its hit area with a pseudo-element overlay without
      // changing its own box (see .mm-ref::after -- the visual mark has to stay
      // 3px because it marks a position on a scale). Credit that overlay --
      // but only if it can actually receive the tap. pointer-events: none is
      // how a purely decorative overlay (a badge, a glow) opts out of hit
      // testing, and crediting one of those would mask a genuinely small
      // control behind it.
      const after = getComputedStyle(el, "::after");
      const hasOverlay =
        after.content !== "none" &&
        after.position === "absolute" &&
        after.pointerEvents !== "none";
      const ow = hasOverlay ? parseFloat(after.width) || 0 : 0;
      const oh = hasOverlay ? parseFloat(after.height) || 0 : 0;
      targets.push({
        cls: el.getAttribute("class") || "(none)",
        w: Math.round(Math.max(r.width, ow)),
        h: Math.round(Math.max(r.height, oh)),
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
    // .mm-card runs a 0.34s mm-pop entrance animation. Measuring mid-animation
    // reads a transform-scaled frame, not the settled layout, which reported a
    // phantom clip at 320x568. Wait on the animations themselves rather than a
    // sleep, so this is deterministic instead of just slower.
    await page.locator(".mm-card").evaluate(async (el) => {
      // getAnimations() can return an empty list if the browser has not run a
      // style pass since the element was inserted -- which would resolve this
      // wait instantly and quietly reopen the mid-animation race. Cross a frame
      // boundary first so mm-pop is registered, then wait on it.
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      await Promise.all(el.getAnimations().map((a) => a.finished));
    });
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
      if (tapTargetFails(t)) {
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
        if (tapTargetFails(t)) {
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
