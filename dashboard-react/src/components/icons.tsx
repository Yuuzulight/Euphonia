// ───────────────────────────────────────────────────────────────────────────
// Custom hand-drawn icon set 💗 — soft pastel glyphs that replace the section
// emoji so the whole dashboard feels bespoke and cohesive (same family as the
// Euphonia favicon). Each is a self-contained inline SVG that inherits text sizing
// via `em`, so it lines up with the heading it sits beside. Decorative only —
// EXCEPT ContourIcon, which carries the same masc/fem register meaning as the
// charts it symbolizes (see its own doc comment below).
//
// The decorative marks below use `currentColor` for every fill/stroke instead
// of the zone/accent palette — they're bespoke multi-shape illustrations, not
// data, so there's no ThemeColors field that means "bow pink" or "sparkle
// gold"; inheriting the surrounding heading's ink color adapts them to every
// theme for free without inventing one-off tokens.

import { useThemeColors } from "../theme/ThemeProvider";

type IconProps = {
  /** rendered size; defaults to 1.15em so it matches emoji weight in a heading */
  size?: number | string;
  className?: string;
  title?: string;
};

function svgProps(viewBox: string, { size = "1.15em", className, title }: IconProps) {
  return {
    viewBox,
    width: size,
    height: size,
    className,
    role: title ? ("img" as const) : undefined,
    "aria-hidden": title ? undefined : (true as const),
    style: { flex: "0 0 auto", verticalAlign: "-0.18em" as const },
    children: title ? <title>{title}</title> : null,
  };
}

/** 🎀 → a soft pink bow — "this take" */
export function BowIcon(p: IconProps = {}) {
  const { children, ...rest } = svgProps("0 0 64 64", p);
  return (
    <svg {...rest}>
      {children}
      {/* scaled up ~20% so the bow carries enough visual weight in a heading */}
      <g transform="translate(32,32) scale(1.2) translate(-32,-32)" fill="currentColor">
        <path d="M27 35 L21 53 L31 45 Z" opacity="0.75" />
        <path d="M37 35 L43 53 L33 45 Z" opacity="0.75" />
        <path d="M32 32 C16 15 6 22 8 31 C6 41 16 48 32 32 Z" />
        <path d="M32 32 C48 15 58 22 56 31 C58 41 48 48 32 32 Z" />
        <ellipse cx="18" cy="27" rx="5" ry="3" opacity="0.35" />
        <ellipse cx="32" cy="33" rx="5.5" ry="6.5" />
      </g>
    </svg>
  );
}

/** ✨ → a four-point sparkle — resonance / brightness */
export function SparkleIcon(p: IconProps = {}) {
  const { children, ...rest } = svgProps("0 0 64 64", p);
  return (
    <svg {...rest}>
      {children}
      <path d="M30 5 C31.5 24 38 30.5 57 32 C38 33.5 31.5 40 30 59 C28.5 40 22 33.5 3 32 C22 30.5 28.5 24 30 5 Z" fill="currentColor" />
      <ellipse cx="30" cy="32" rx="5" ry="5" fill="currentColor" opacity="0.4" />
      <path d="M52 8 C53 15 55 17 61 18 C55 19 53 21 52 28 C51 21 49 19 43 18 C49 17 51 15 52 8 Z" fill="currentColor" opacity="0.75" />
      <path d="M14 45 C15 50 16 51 21 52 C16 53 15 54 14 59 C13 54 12 53 7 52 C12 51 13 50 14 45 Z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

/** 🎚️ → a pitch contour that rises (pink, in register) then dips into masc-blue
 *  (fell out of register) — literally the thing this section measures. Unlike
 *  the rest of this file, these colors are NOT decorative: honoring the app's
 *  strict color convention (blue = masculine register, never reassigned), the
 *  dip is wired to the same zone tokens as the charts it symbolizes, so it
 *  can't drift out of sync with them under any theme. */
export function ContourIcon(p: IconProps = {}) {
  const colors = useThemeColors();
  const { children, ...rest } = svgProps("0 0 64 64", p);
  return (
    <svg {...rest}>
      {children}
      {/* soft pink fill = the "in-register" hill above the floor (adds mass) */}
      <path d="M7 40 C16 40 22 14 32 14 C40 14 42 26 47 29 L47 37 L7 37 Z" fill={colors.zoneStrong} />
      {/* register floor — the line you fall below */}
      <path d="M7 37 H57" stroke={colors.zoneGrow} strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="0.1 7" />
      <path d="M7 40 C16 40 22 14 32 14 C40 14 42 26 47 29" stroke={colors.zoneFem} strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <path d="M47 29 C53 31 53 50 59 50" stroke={colors.zoneMascInk} strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="14" r="5.5" fill={colors.zoneFem} />
      <circle cx="59" cy="50" r="5.5" fill={colors.zoneMasc} />
    </svg>
  );
}

/** 🔍 → a magnifying glass cradling a little heart — insights for this take */
export function InsightIcon(p: IconProps = {}) {
  const { children, ...rest } = svgProps("0 0 64 64", p);
  return (
    <svg {...rest}>
      {children}
      <path d="M37 38 L52 53" stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.75" />
      <circle cx="27" cy="27" r="16" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="6" opacity="0.75" />
      <path d="M27 35 C18 29 18 21 24 21 C26 21 27 23 27 24 C27 23 28 21 30 21 C36 21 36 29 27 35 Z" fill="currentColor" />
    </svg>
  );
}

/** 📈 → a soft rising line chart with a sparkle at the peak — trends over time */
export function TrendsIcon(p: IconProps = {}) {
  const { children, ...rest } = svgProps("0 0 64 64", p);
  return (
    <svg {...rest}>
      {children}
      <path d="M9 52 H56" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M11 45 L24 35 L38 40 L52 17" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="45" r="4" fill="currentColor" opacity="0.6" />
      <circle cx="24" cy="35" r="4" fill="currentColor" />
      <circle cx="38" cy="40" r="4" fill="currentColor" opacity="0.6" />
      <circle cx="52" cy="17" r="5.5" fill="currentColor" />
      <path d="M52 6 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4 -4 -4 -1.4 4 -1.4 z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

/** 📖 → a little stack of recording cards — all recordings */
export function CardsIcon(p: IconProps = {}) {
  const { children, ...rest } = svgProps("0 0 64 64", p);
  return (
    <svg {...rest}>
      {children}
      <rect x="25" y="13" width="29" height="23" rx="5" fill="currentColor" opacity="0.35" />
      <rect x="16" y="19" width="31" height="25" rx="5.5" fill="currentColor" opacity="0.55" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <rect x="8" y="26" width="35" height="28" rx="6" fill="currentColor" opacity="0.15" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
      <rect x="14" y="33" width="19" height="3.6" rx="1.8" fill="currentColor" />
      <rect x="14" y="40" width="12" height="3.6" rx="1.8" fill="currentColor" opacity="0.6" />
      <circle cx="37" cy="47" r="4.2" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

/** 💡 → a cozy lightbulb with a heart filament — "what do these mean?" */
export function BulbIcon(p: IconProps = {}) {
  const { children, ...rest } = svgProps("0 0 64 64", p);
  return (
    <svg {...rest}>
      {children}
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5">
        <path d="M32 3 V8" />
        <path d="M8 13 L12 16" />
        <path d="M56 13 L52 16" />
      </g>
      <path d="M32 8 C19 8 11 18 11 28 C11 34 14.5 37.5 17.5 41 C19.5 43.2 20 44.2 20 46 L44 46 C44 44.2 44.5 43.2 46.5 41 C49.5 37.5 53 34 53 28 C53 18 45 8 32 8 Z" fill="currentColor" opacity="0.4" />
      <path d="M32 33 C25 28 25 22 30 22 C31.6 22 32 23.6 32 24.5 C32 23.6 32.4 22 34 22 C39 22 39 28 32 33 Z" fill="currentColor" />
      <rect x="25" y="46" width="14" height="5" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="27.5" y="51" width="9" height="4" rx="2" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

/** 🎵 → the Euphonia mark: a 5-bar soundwave in trans-flag order (matches the
 * favicon) — hero mark. Bar colors left-to-right follow the trans pride
 * flag's actual stripe order (blue, pink, white, pink, blue), echoing both
 * "voice" (the app's own themed waveform player uses the same rounded-bar
 * look) and the people this app is for. */
export function EuphoniaIcon(p: IconProps = {}) {
  // viewBox cropped tight to the bars' bounding box so the mark fills the
  // icon instead of floating small in a wider field.
  const { children, ...rest } = svgProps("-11 76 421 249", { size: "1.15em", ...p });
  return (
    <svg {...rest}>
      {children}
      <rect x="12" y="157.25" width="59.87" height="85.5" rx="29.94" fill="#78c3f5" />
      <rect x="91.03" y="128.75" width="59.87" height="142.5" rx="29.94" fill="#ffa0c3" />
      <rect x="170.06" y="98.22" width="59.87" height="203.57" rx="29.94" fill="#fffafc" />
      <rect x="249.1" y="128.75" width="59.87" height="142.5" rx="29.94" fill="#ffa0c3" />
      <rect x="328.13" y="157.25" width="59.87" height="85.5" rx="29.94" fill="#78c3f5" />
    </svg>
  );
}
