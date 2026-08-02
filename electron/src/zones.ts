// Ported from dashboard-react/src/zones.ts — same thresholds and direction
// conventions as the dashboard's own color-coded zone bands, used here to
// pre-classify each metric before handing it to Gemini, so the model isn't
// left to infer domain-specific thresholds/direction itself (some of these,
// like vocal weight, are genuinely non-obvious — see WEIGHT_ZONES below).
//
// This is a deliberate duplication, not a shared import: electron/'s tsconfig
// (rootDir: "src") can't reach across into dashboard-react/'s separate build
// without restructuring both packages' output layout. Only the fields used in
// electron/src/gemini.ts's prompt are ported (name only, not `color` — this
// file has no UI to color). If dashboard-react/src/zones.ts's thresholds
// change, mirror the change here.

interface ZoneRange {
  from: number;
  to: number;
  name: string;
}

export const PITCH_ZONES: ZoneRange[] = [
  { from: 100, to: 145, name: "masc" },
  { from: 145, to: 165, name: "neutral" },
  { from: 165, to: 260, name: "fem" },
];

export const F2_ZONES: ZoneRange[] = [
  { from: 1100, to: 1340, name: "deeper" },
  { from: 1340, to: 1420, name: "neutral" },
  { from: 1420, to: 2200, name: "bright" },
];

export const HNR_ZONES: ZoneRange[] = [
  { from: 0, to: 10, name: "breathy" },
  { from: 10, to: 18, name: "clear-ish" },
  { from: 18, to: 35, name: "clear" },
];

export const JITTER_ZONES: ZoneRange[] = [
  { from: 0, to: 1, name: "steady" },
  { from: 1, to: 2, name: "okay" },
  { from: 2, to: 6, name: "rough" },
];

// NOTE direction: smaller = lighter/feminine, larger = heavier/masculine —
// flipped vs. the old alpha-ratio metric this project used to use (a real
// past bug). Don't "fix" this to look more intuitive; it's correct as-is.
export const WEIGHT_ZONES: ZoneRange[] = [
  { from: 0, to: 10, name: "light" },
  { from: 10, to: 12.5, name: "overlap" },
  { from: 12.5, to: 20, name: "heavy" },
];

export function zoneOf(zones: ZoneRange[], v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const match = zones.find((z) => v >= z.from && v < z.to);
  return (match ?? zones[zones.length - 1]).name;
}
