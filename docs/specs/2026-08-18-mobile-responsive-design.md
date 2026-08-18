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

- `max-width: 600px` — phone. Layout stacking. (Not the chart: it sizes from
  its measured container, so it needs no breakpoint — see Contour chart.)
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

**Corrected 2026-08-18, during planning.** This section first proposed a fixed
alternate viewBox (~380 units) below the phone breakpoint. Measuring at three
widths showed that does not work, and that the problem is not phone-only:

| viewport | contour rendered | scale | 9-unit text |
|---|---|---|---|
| 375 px | 299 px | 0.332 | 3.0 px |
| 768 px | 682 px | 0.758 | 6.8 px |
| 1280 px | 964 px | 1.071 | 9.6 px |

A 900-unit viewBox needs 800 px of render to clear an 8 px floor, so labels are
too small on everything below roughly a 1050 px viewport — a tablet fails just
as a phone does, and a 600 px breakpoint would have missed it. Meanwhile a
fixed 380-unit viewBox gives 7.9 px at 375 px (still failing) and 16 px at
768 px (absurdly large). No single alternate constant works.

The fix instead makes the viewBox track the rendered width, so the scale is
always about 1:1:

    W = min(900, round(renderedWidth))     // clamped to a 260 floor

Every dimension in the component already derives from `W`, `H` and `pad`, so
padding, ticks and stroke widths follow automatically. Properties of this
form, all of which the audit checks:

- **Continuous.** At 900 px rendered both branches give 9 px text; there is no
  jump at the boundary.
- **Desktop is byte-identical.** Above 900 px rendered, `W` stays 900 and the
  chart is exactly what ships today — which is what makes the desktop-parity
  assertion meaningful rather than a formality.
- **Correct by construction at every width**, not at the widths someone
  remembered to write a breakpoint for.

`H` stays 240. Below the threshold the chart renders 240 CSS px tall at every
width, instead of shrinking with the viewport as it does now.

Rejected alternatives: scaling `fontSize` up to compensate (leaves padding,
ticks and stroke widths at desktop proportions, so the chart looks
progressively wronger as it narrows), and the fixed-alternate-viewBox approach
this section originally specified, for the arithmetic above.

### Metric modal (problems 2 and 3)

`.mm-card` gets the treatment `.modal` already has: `max-height: calc(100dvh -
40px)` (with a `100vh` fallback line before it) and `overflow-y: auto`, plus
`overscroll-behavior: contain` so scrolling the modal does not scroll the page
behind it. This is what makes the landscape case reachable. The 40px is not
arbitrary: `.mm-backdrop` is `position: fixed; inset: 0` with `padding: 20px`,
so 40px is exactly the vertical padding the card sits inside.

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
- **The chart now measures itself.** A viewBox computed from a measured
  container means the chart depends on layout having settled, and on a
  `ResizeObserver` firing. First paint before measurement must render
  something sane rather than collapsing to zero width. Mitigated by assertion 2
  covering every width, and by seeding the measured width from the 900 default
  so the pre-measurement render is today's behaviour.
- **Touch sizing could reflow layouts.** Growing hit areas under
  `(pointer: coarse)` can change wrapping on a touch laptop, which is a coarse
  pointer at desktop width. Assertion 1 runs at every width with coarse
  pointer emulation to catch it.

## Outcome

Implemented 2026-08-18. All eight audit viewports pass; both desktop rows are
byte-identical to the pre-work baseline under a fine pointer.

Two things this design got wrong, worth recording plainly rather than
smoothing over:

The trend `LineChart`s were called "already fine" above, on the strength of a
single 375px measurement. They were not: at 320x568 the chart's own label text
renders 7.92px, under the 8px floor, because `.chart-grid`'s `minmax(300px,
1fr)` column doesn't shrink below 300px even though the surrounding `.wrap`
only has 280px to give it at that width. Task 7 fixed it by reclaiming
`.chart-card`'s side padding under `@media (max-width: 360px)` — the card's
outer width stays pinned by the grid track, so this only reallocates space the
card already had. A `LineChart` viewBox rewrite along the `ContourChart`
pattern was considered and rejected: the naive version would also engage at
1280px, shrinking the desktop chart's viewBox and growing its text from 8.6px
to 9px — a desktop change the brief explicitly rules out.

This design also anticipated two width breakpoints for layout stacking. None
were needed. All four grids (`.stat-grid`, `.chart-grid`, `.gloss`,
`.rec-grid`) already use `repeat(auto-fit, minmax())` and collapse to a single
column on their own as space runs out. Task 7's layout review walked the
seeded fixture at 320px and 375px against all five questions this spec raised
and found nothing to fix. The only width breakpoint that exists anywhere on
this branch is the 360px one above, and it exists for chart legibility, not
layout stacking — Task 7 added no other CSS at all, which is the correct
result, not a shortfall.

One other correction happened earlier, during planning rather than
implementation: the contour chart fix described above was changed from a
fixed alternate viewBox at a phone breakpoint to a viewBox measured from the
chart's own container, after measuring at 375 / 768 / 1280px showed no single
fixed constant holds at every width. See the Contour chart section above,
which already reflects the corrected approach.

Across the whole branch, the responsive audit went from 381 failures to 0
across the eight viewports it checks.

Still unverified, and not verifiable this way: anything requiring physical
hardware. See the Verification section.

Two margins are worth recording rather than just leaving green, because both
are close enough to their floor that an unrelated future change could reopen
them without the audit necessarily catching it at the exact spot that matters:

- The contour chart's fix above is a straight consequence of making its
  viewBox track rendered width: at 320px on the densest seeded take (11
  phrases) the per-phrase landing dots (`r={4.5}` in `ContourChart`) now clear
  each other by only 1.42px, versus overlapping outright before the fix. The
  same 4.5-unit radius reads as ~9px on screen at 320px in the now-≈1:1
  viewBox, where it used to read as ~1.2px. Real takes routinely run well
  past 11 phrases, so tighter clusters than the seeded fixture **will**
  overlap at narrow widths — this is cosmetic only, since the dots carry
  `<title>` tooltips and no click/keyboard interaction, but it is not
  hypothetical.
- The 320px trend-chart fix (reclaiming `.chart-card`'s side padding under
  `@media (max-width: 360px)`, described above) leaves the chart's own label
  text at 8.28px against the 8px floor — a 3.5% margin. A later change to
  `.chart-card` padding or border width, made without rerunning the audit at
  320px specifically, could erase it.

Also worth writing down rather than assuming: **CI does not run this audit.**
It needs Playwright plus a preview server on 4173, the same reason
`screenshot_themes.mjs` is a manual step rather than a pipeline stage. That
makes the 381 → 0 result point-in-time, not continuously enforced — a
regression here is something a person has to run the script and notice, not
something a red CI check surfaces automatically. Wiring the audit into CI was
considered and set aside for this branch: it is infrastructure work, and this
plan is about CSS.
