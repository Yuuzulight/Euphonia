# Theme system — decisions and known gaps

The eight-theme system landed in one branch. Along the way a number of
decisions had to be made that the code itself does not explain, and a number
of small problems were found and deliberately left. Both are recorded here,
because neither survives in the commit history.

Each decision states what was decided, why, and what it costs if the call was
wrong — the last part matters most, since it is what makes any of these cheap
to revisit.

## Decisions

> **Superseded, 2026-08-17.** Rulings E and M below grandfathered eight blossom
> contrast failures on the grounds that the palette was frozen. It was
> subsequently unfrozen on purpose: all eight are fixed, `BASELINE_EXCEPTIONS`
> is now empty, and every theme clears every floor on its own values. The
> reasoning below is kept because it explains why the exceptions existed at all,
> and because the button fix it anticipated is the one that was eventually used.

- **R1 — the checker must assert blossom declares every token the contrast pairs reference.** As first written, a missing token made its contrast pair silently skip, so the checker would have exited 0 against a stylesheet that had not been tokenised at all — leaving the entire sweep unverified. Costs if wrong: a stricter checker could reject a legitimate future token rename; the fix is one line.

- **R2 — theme blocks use `[data-theme="…"]` attribute selectors, with blossom on `:root, [data-theme="blossom"]`.** The Settings swatch chips preview a theme by putting `data-theme` on a `<span>`, and `:root[data-theme=…]` only ever matches the root element, so every chip would have silently rendered in the active theme instead of its own. The alternative — a duplicated colour map for chips — reintroduces exactly the drift the token system exists to prevent. Costs if wrong: attribute selectors carry marginally lower specificity; the fix is to restore the `:root` prefix and give chips inline colours.

- **R3 — mount with the named `StrictMode` import.** The plan's sample used `<React.StrictMode>`, which needs a bare `React` import that this repo forbids and `main.tsx` does not have. Costs if wrong: none, a straight correction.

- **R4 — the screenshot sweep serves the build over http via `vite preview` rather than opening `dist/index.html` over `file://`, and asserts the applied theme matches the one requested.** Chromium gives `file://` pages an opaque origin where localStorage is unreliable and the reference-data fetch fails outright, so the sweep could have produced sixteen identical screenshots and been read as a pass. Costs if wrong: the sweep needs a preview server running alongside it.

- **Ruling E** — blossom's four failing contrast pairs get an enumerated baseline exception in the checker; every other theme still must clear the floors. Measured: --ink-soft on --card 3.04:1, --ink-soft on --bg-base 2.81:1, --titlebar-ink on --titlebar-bg 4.42:1, --on-accent on --accent 1.63:1 (all vs 4.5/3.0 floors) — why: two Global Constraints collided, "blossom pixel-identical" vs the WCAG floors, and the spec's "blossom (today's, unchanged)" is the binding authority; the alternative is silently restyling a palette the user tuned by hand and explicitly froze — costs if wrong: blossom keeps a pre-existing accessibility shortfall the user may want fixed; recovery is a scoped accessibility pass on blossom alone. ENUMERATED, not skipped, so any change to blossom's colors re-trips the check. **MUST SURFACE TO USER** — white on pastel pink at 1.63:1 is the primary button, and this bears directly on their stated "easier on the eyes" goal.

- **Ruling F** — add `--zone-masc-ink: #5e7fb8`, a text-legible variant of the masc data color, for `.posbar-val` and `.mm-ref-masc .mm-ref-spk` — why: the implementer mapped these onto `--zone-masc` (#bcd3f0), which both visibly lightened solid text to a pale fill tint AND used a data token as chrome; I verified both sites are genuinely masc-coded (posbar-fill takes `MASC` from RegisterSection.tsx:103), so a masc-family text token is semantically honest where a chrome token would not be — costs if wrong: one extra data token per theme; recovery is renaming it.

- **Ruling G** — preserve visibly-distinct colors; consolidate only near-identical ones, at a max per-channel delta of 12/255 — why: my mapping table over-consolidated, collapsing 75 of ~180 replacements including #b06a96→#9d8ba8 (delta 33) and #a25688→#9d8ba8 (delta 53), which are plainly visible changes to a hand-tuned palette the spec freezes; but blanket byte-preservation is equally wrong, since the file also contains #ffe3f0 vs #ffe3f1 (delta 1) which no one can see — costs if wrong: ~10 extra tokens for all 8 themes to define, and Task 5's palettes must supply them; recovery is consolidating later, which is cheap, whereas an unnoticed restyle of the default theme is not.

- **Ruling H** — the 33 rgba() shadow/overlay literals become new Task 2b, run before Task 5 — why: they are out of the hex grep's scope so Task 2 is not wrong to leave them, but they are theme-dependent (a purple-tinted shadow and rgba(255,255,255,0.75) overlays would be glaringly wrong on a near-black card), so the palettes cannot be correct until they are tokenized; folding them into an already 200k-token task risks losing the sweep that is already done — costs if wrong: one extra task boundary.

- **Ruling J** — the inline pre-paint script must duplicate loadPref's per-field family validation, not merely resolvePref's mode branch; and scripts/test_theme_tokens.js gains a check that index.html lists every theme the stylesheet defines — why: the reviewer found two divergences on the JSON.parse SUCCESS path that Ruling I never touched, since neither reaches the catch — `{"mode":"light","light":"cocoa",...}` painted a dark theme then snapped light, and `{"mode":"auto"}` painted the literal string "undefined"; both are the precise flash the script exists to prevent, and both are defects in my plan's code rather than the implementer's work — costs if wrong: a third copy of the theme ids now lives in index.html, which is exactly why the new checker assertion is part of the same ruling. Plan amended (beabde8).

- **Ruling K** — Task 5 rewritten as Task 5a (two light themes) + Task 5b (five dark themes), and both restated against the real 51-token vocabulary instead of the ~30 the original palettes assumed — why: Rulings G and H grew the token set (12 role tokens split back out of over-consolidated shades, --zone-masc-ink, --control-bg, 7 translucent triples), so the plan's palette blocks would have failed parity for all seven themes on their first run; and at 7 × 51 = 357 values a single task is too large a review surface, with the dark family carrying all the risk — costs if wrong: one extra task boundary, and the derived (non-anchor) values are now the implementer's judgment rather than transcription, so they need real review. Anchors from the approved mockups are still mandated verbatim. Plan amended (afc645d).

- **Ruling L** — when an anchored (mockup-approved) value collides with a contrast floor, move `--on-accent` rather than the anchor — why: anchors are what the user approved by eye; --on-accent is a derived token with no mockup mandate, so the derived one yields. Measured: paper's anchored --accent #c2a878 is 2.29:1 under white but 4.48:1 under paper's own ink #45403a, and --accent-2 #a89a84 is 3.72:1 under the same ink (both gradient stops must clear 3.0). The implementer had instead darkened the accent to #a58e63, which passed but desynced it from the separately-anchored --wave-progress #c2a878 — restoring the anchor also dissolves that mismatch, and makes paper consistent with the dark family, whose --on-accent is a dark ink for the same reason. Explicitly NOT applied to light-mint: its #4f9e7f is 3.22:1 under white, which passes — costs if wrong: paper's buttons carry dark text instead of white; trivially reversible.

- **Ruling N** — the reviewer's "hue leak" finding on light-mint's --zone-strong (#f7cfd6, pink) is REJECTED and the implementer's value stands — why: the spec's Token model names the loudness trio among the DATA tokens and requires them to keep the "same hue family" across themes, changing only for legibility; --zone-strong means "strong" and is pink in blossom, so retinting it mint would make one colour mean different things in different themes — the exact failure the data/chrome split exists to prevent. The reviewer's suggested fix would have been the real violation — costs if wrong: a pale pink appears in the mint theme's loudness bar, which is intended. (The implementer's *stated justification* WAS self-contradicting, as the reviewer correctly spotted — that gets corrected, the value does not.)

- **Ruling M** — light-mint's --on-accent must go dark like paper's, AND --on-accent/--accent-2 joins CONTRAST_PAIRS with a fifth BASELINE_EXCEPTIONS entry for blossom — why: white on light-mint's --accent-2 #7fa8c4 is 2.53:1, and 5 of the 9 call sites are the accent→accent-2 gradient button, so the far half of every primary button in a NEW theme sits below the floor; blossom is grandfathered only because the user froze it, which is not a licence to inherit the defect into new themes. Measured #1b2b24 at 4.61/5.86 vs #355044 at 2.74/3.48. The pair was untested, which is why this reached review at all — costs if wrong: I relaxed the "frozen at four" rule I set myself; the distinction is that a newly-CHECKED pair exposing another pre-existing blossom shortfall widens coverage, whereas a new theme buying an exception weakens it. New themes must pass the new pair on their own.

- **Ruling O** — the ≤12 max-per-channel-delta rule from the CSS sweep (Ruling G) applies to the JS-side substitutions too, and was never carried across — why: the review found blossom is NOT pixel-identical in three visible places, and the implementer's self-review missed it because it evaluated the changes on information loss and palette philosophy rather than comparing resolved values against blossom's hexes. (1) Six icons that were genuinely multi-hued (Sparkle mixed pink/gold/lavender, Cards mixed lavender/pink/white/mint) now render as one flat --ink-heading purple, because every call site sits in a .section-title; the "prefer currentColor" guidance was about SINGLE-colour glyphs and I should have said so. Fix: revert to literals, same exception class as the flag bars. (2) Five trend-chart series lost their distinct hues, two changing family entirely (#5fb89a teal → pink, #d99a4e amber → lavender). Fix: --chart-1..5 with blossom = the original literals. (3) #c75c93 emphasis text became a pale --accent, and gridlines #efe6f0/#e7ddef became --line #ffffff, invisible on a near-white card — the existing --line-soft is within threshold of both and just was not exposed on ThemeColors — costs if wrong: ~7 new tokens across 8 themes; the alternative is shipping a visibly restyled default theme, which the spec forbids.

- **Ruling P** — blossom's native window-button colour moves from the hardcoded #6b5876 to --titlebar-ink's #7a5a92, ACCEPTED as the one knowing blossom change — why: verified from history that the original main.ts used #6b5876 (the old --ink) while the renderer's own .titlebar text was #7a5a92, so the native buttons and the app's title row never matched despite main.ts's own comment saying they should "form one seamless themed bar"; unifying them on --titlebar-ink fulfils that documented intent and keeps electron/src/theme.ts a faithful mirror of the CSS token, which is what makes the cross-file check meaningful — costs if wrong: the window buttons shift by max 28/255 on one small UI element; trivially reversible by pinning blossom's entry. **SURFACE TO USER** — this is the only place blossom is knowingly allowed to change.

## Known gaps, deliberately left

None of these block anything. They are recorded so the next person finds them
by reading rather than by tripping over them.

- minor (deferred): file header claims "same style as test_protocol_paths.js" but the structure is a flat run() rather than the per-test assert pattern — the in-code claim is inaccurate

- minor (deferred): the electron cross-file check is a bare substring search for `"<id>"` anywhere in theme.ts, so a match inside a comment or unrelated string would satisfy it — weak guarantee, inherited verbatim from the plan

- minor (deferred): `--ink-warm` names itself by color temperature, not role, unlike its siblings --ink-strong/--ink-heading/--ink-accent/--ink-callout

- minor (deferred): --bg-glow-1/--bg-glow-2 do double duty as page-background glows AND small border tints across unrelated components — inherited from the old --pink-soft/--lav-soft doing the same, not a regression from this task

- minor (deferred): report task-2b-report.md:37 states a delta of 79 where the correct value is 69 — conclusion unaffected (both exceed 12), but the stated math is wrong

- minor (deferred): report task-2b-report.md:26 claims 14 occurrences for --accent-glow-rgb where the report's own table lists 11; 11 makes the total sum to the headline 32, 14 does not

- minor (deferred): --modal-shadow-rgb is also used on .mm-take-dot, so the name is narrower than its usage

- minor (deferred): --highlight-rgb (a pink active/playing accent) sits close in name to --overlay-rgb, whose documented role uses the word "highlights"

- minor (deferred): `JSON.parse(raw) as Partial<ThemePref>` is an unchecked cast — benign given the downstream per-field guards

- minor (deferred): checkPrePaintScript's regex scans the WHOLE index.html for quoted strings rather than the pre-paint script's LIGHT/DARK arrays specifically, so a theme id appearing in an unrelated attribute or comment would satisfy it while the arrays stayed stale. My instructed design, not an implementer deviation. Benign today (no such strings exist) but it does weaken the guard — final review should triage whether to scope the regex to the arrays before merge.

- minor (deferred): loadPref() is called twice on mount (once for pref, once inside resolvePref(loadPref())) — plan-mandated, harmless since it is a pure sync read

- minor (deferred): paper's --success is byte-identical to blossom's while its --danger was retuned — no rationale given either way

- minor (deferred): --ink-warm treated as a fixed warm outlier in both new themes rather than retinted to each hue family — defensible and documented

- minor (deferred): report states the --danger/--control-bg range as 4.68-5.58:1; independent recomputation gets 4.78 as the low end. No compliance impact (pair is not in CONTRAST_PAIRS), reporting-precision nit only.

- minor (deferred): --danger/--success are byte-identical across dusk-plum, midnight and cocoa and near-identical on the other two, rather than bespoke per theme the way --wave/--live/ink are. Defensible for this task's scope; a polish follow-up.

- minor (deferred): zones.ts's header comment still cites specific hex values that are now only blossom's, not universal — compliant with the brief (which said keep the header intact) but a future reader could misread it as still-hardcoded. Task 12 (docs) is the natural place to fix the wording.

- minor (deferred): ContourChart reuses zoneMascInk for a thick contour stroke, a slightly different role from the three small-text uses

- minor (deferred): .settings-btn still has no :focus-visible outline while the new .theme-toggle does — pre-existing, but the two now sit in the same row so the inconsistency is newly visible

- minor (deferred): className template-string concatenation duplicated at two call sites in ThemePicker.tsx

- minor (deferred): the visually-hidden radio uses position:absolute without a position:relative parent — harmless at zero size, latent if reused with dimensions

- minor (deferred): the assertion checks data-theme but not that the stylesheet loaded — a build shipping a broken CSS would pass while producing 16 unstyled shots. Out of the brief's scope (it guards storage fallback) and the human look would catch it.

- minor (deferred): the script duplicates the theme id list rather than importing from themes.ts, so a future theme silently goes uncovered. Third copy of the ids; the checker guards index.html and electron/theme.ts but not this script.

- minor (deferred): the rewritten colour-convention text drops the pointer to zoneMascInk, so a reader wondering why that token exists won't find it there

- minor (deferred): README's "Prefer a different look?" rhetorical opener is a register wobble against the rest of the file's direct statements
