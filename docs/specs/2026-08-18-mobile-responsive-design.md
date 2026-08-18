# Mobile Support for the Browser Version — Design

## Goal

Make the browser version genuinely usable on a phone. The layout already
survives a narrow viewport — nothing overflows horizontally — but almost
nothing was designed for one: two media queries in 2,387 lines of CSS, chart
labels that render at 3 px, and touch targets a third of the platform minimum.

The browser and desktop builds share one UI codebase, so every change here is
scoped by width or by pointer type. The desktop app at its normal size renders
exactly as it does today; a narrow Electron window picks up the improvements
for free.

## Non-goals (explicitly out of scope)

- **No mobile-specific components.** One set of components, adapted by
  breakpoint. A phone-only contour chart would double the surface to maintain
  and to check across eight themes.
- **No fluid-token rewrite.** Replacing fixed pixels with `clamp()` throughout
  would touch all 2,387 lines the theme work just stabilised, and regressions
  would surface across eight themes at once. Breakpoints are the smaller blast
  radius.
- **No section navigation.** The dashboard is 7,100 px tall on a phone (~8.7
  screens). That is inherent to a dashboard this rich; a jump-to-section
  affordance is a feature, not a mobile fix. Recorded here as an observation.
- **No changes to what the metrics mean or how they are computed.** This is
  presentation only.
- **No real-device testing claims.** See Verification.

## Where the problems actually are

Everything below was measured against a populated dashboard at 375x812 in
viewport emulation, not inferred from reading CSS. The dashboard had never
been reviewed populated at any width: `public/recordings.json` ships as `[]`,
so the existing theme screenshots captured an empty page.

| # | Problem | Measurement |
|---|---|---|
| 1 | Contour chart labels illegible | 900-unit viewBox rendered at 299 px (scale 0.332); text at 9-10 units lands at **3.0 px** |
| 2 | Metric modal unreachable in landscape | at 802x375 the panel is clipped **74 px** below the fold, with `overflow-y: visible` on both panel and backdrop |
| 3 | Reference markers untappable | `.mm-ref` hit boxes are **3x14 px**; they play preview clips |
| 4 | Touch targets below platform minimum | **14** interactive elements under 44x44 (`.theme-toggle` / `.settings-btn` 34 square, `.rec-delete` 35x25, `.mm-close` 26 square) |
| 5 | Modal height uses the wrong unit | `.modal` caps at `calc(100vh - 40px)`; on iOS Safari `100vh` ignores the collapsing toolbar |
| 6 | Hover-only affordance dead on touch | `.rec-delete` rests at `opacity: .55` and only reaches 1 on `:hover`, which never fires |

Problems 1, 2, 5 and 6 are invisible at desktop widths. They are not
regressions from the theme work — they were never observable at 1280 px.

Two things measured and found **already fine**, recorded so nobody spends
effort there: the trend `LineChart`s render their labels at 9 px (viewBox 300
at ~1.0 scale), and there is no horizontal overflow at 375 px, populated or
empty.

## Breakpoints

Two width breakpoints and two capability queries:

- `max-width: 600px` — phone. Layout stacking and chart adaptation.
- `max-width: 900px` — narrow / small tablet. Intermediate column counts.
- `(hover: none)` — touch affordances, independent of width.
- `(pointer: coarse)` — touch target sizing, independent of width.

The separation is deliberate. Width decides *layout*; pointer type decides
*affordances*. A 34 px button is fine under a mouse at any width and wrong
under a thumb at any width, so sizing keys off the pointer, not the viewport.
Neither capability query matches a normal desktop, which is what keeps the
desktop app unchanged.

## The changes

### Contour chart (problem 1)

`ContourChart` renders a fixed `W = 900` viewBox scaled by CSS to whatever the
card is wide. Everything inside — including text — scales with it.

The fix is to make the chart's intrinsic width a function of the space it has,
rather than a constant: below the phone breakpoint use a viewBox around 380
units wide, so a 299 px render lands near 1:1 and the existing 9-10 unit font
sizes resolve to legible pixels. Fewer x-axis ticks at that width, since 900
units of labels will not fit in 380.

Rejected alternative: scaling `fontSize` up to compensate (e.g. 27 units to
land at 9 px). It works arithmetically but leaves every other dimension —
padding, tick marks, stroke widths — at desktop proportions, so the chart
looks progressively wronger as it narrows.

### Metric modal (problems 2 and 3)

`.mm-card` gets the treatment `.modal` already has: `max-height: calc(100dvh -
32px)` (with a `100vh` fallback line before it) and `overflow-y: auto`, plus
`overscroll-behavior: contain` so scrolling the modal does not scroll the page
behind it. This is what makes the landscape case reachable. 32px rather than
`.modal`'s 40px because `.mm-card` is centred over a backdrop with less
surrounding chrome; the exact figure matters less than the cap existing.

`.mm-ref` markers keep their visual size and gain an invisible expanded hit
area via a pseudo-element. They are positioned on a measurement scale — making
the mark itself thumb-sized would misrepresent the data it encodes.

### Viewport units (problem 5)

`100vh` becomes `100dvh` wherever a modal is capped, with the `100vh`
declaration retained immediately before it as a fallback for browsers without
`dvh`. Applies at all widths: `dvh` and `vh` are identical on desktop, so this
is a no-op there rather than a desktop change.

### Touch targets (problem 4)

Under `(pointer: coarse)`, interactive controls get a 44x44 minimum. Achieved
with padding and `min-height`/`min-width` rather than by scaling icons up, so
the visual design is unchanged and only the hit area grows.

### Hover affordances (problem 6)

Under `(hover: none)`, `.rec-delete` rests at full opacity. The remaining 27
`:hover` rules are to be audited during implementation for any other case
where hover conveys information rather than polish; purely decorative hover
states need no touch equivalent.

## Sample data

The browser build reads recordings from IndexedDB (`euphonia-browser`, v2,
stores `recordings` / `audio` / `insights` / `details`), not from
`public/recordings.json` — that path is only used when `window.euphonia`
exists. Any fixture that populates the browser dashboard has to be injected
into IndexedDB.

`scripts/seed_sample_data.mjs` generates five deterministic takes with a
plausible progression (mean pitch 160 to 197 Hz, in-register 40% to 100%),
including full per-take detail with pitch frames and phrases so the contour
chart has real data with real gaps.

It must **export** those takes rather than write them into `public/`:
`public/recordings.json` is tracked as `[]`, and writing fixtures there risks
committing them and puts sample voice data on a path that
`electron-builder.yml` deliberately filters out of the installer. The audit
and screenshot scripts import the generator and inject via `page.evaluate`.

Determinism matters: the generator seeds a small PRNG rather than using
`Math.random()`, so screenshots diff cleanly and a layout regression is the
only thing that can move between runs.

## Verification

`scripts/audit_responsive.mjs`, in the spirit of `scripts/test_theme_tokens.js`
— a plain script that asserts, not a screenshot pile a human has to squint at.
It seeds IndexedDB, then at each of 320 / 375 / 414 / 600 / 768 / 1024 /
1280 px wide plus one landscape size asserts:

1. no horizontal overflow (`documentElement.scrollWidth <= clientWidth`)
2. every SVG `<text>` resolves to at least 8 px on screen, computed as
   `fontSize * (renderedWidth / viewBoxWidth)` — the check that would have
   caught the 3 px labels
3. no interactive element below 44x44 when emulating a coarse pointer
4. every open modal is either fully on screen or scrollable to its end

Assertion 2 is the important one: it tests the *rendered* size, so it stays
honest if someone later changes a viewBox or a font size in isolation.

The desktop-untouched claim is verified by running the audit at 1280 px with a
**fine** pointer before and after, and requiring identical results — not by
assuming media queries do what they say. The pointer type has to be pinned
here: assertion 3 emulates a coarse pointer, which legitimately grows hit
areas at every width including 1280, so a desktop-parity run made with coarse
emulation would report a difference that is the feature working correctly.

**What this does not cover.** Everything here is viewport emulation. It cannot
tell you how iOS Safari's collapsing toolbar behaves in practice, whether the
record button falls under a thumb, or how the app feels one-handed. Those need
a real device. Claims in this repo should say "measured in emulation" and stop
there.

## Risks

- **`dvh` support.** Safari 15.4+, Chrome 108+. Older browsers fall through to
  the `100vh` declaration, i.e. today's behaviour. No regression, just no fix.
- **The chart breakpoint is a second rendering path.** A viewBox that changes
  with width means the chart has two configurations to keep working. Mitigated
  by assertion 2 covering every width, not just the phone one.
- **Touch sizing could reflow layouts.** Growing hit areas under
  `(pointer: coarse)` can change wrapping on a touch laptop, which is a coarse
  pointer at desktop width. Assertion 1 runs at every width with coarse
  pointer emulation to catch it.
