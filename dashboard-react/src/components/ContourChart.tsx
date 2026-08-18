import { useEffect, useRef, useState } from "react";
import type { RecordingDetail } from "../types";
import { MASC, FEM, zoneColor } from "../zones";
import { useThemeColors } from "../theme/ThemeProvider";

interface Props {
  detail: RecordingDetail;
  femThreshold?: number; // Hz that reads feminine (for the soft pink band)
}

// The pitch contour over time, with the register floor drawn across it.
// Frames that crash BELOW the floor are painted blue (the masculine register),
// so register breaks at phrase endings jump out visually. Phrase boundaries
// are marked with soft dividers and a dot under each ending (pink = landed in
// register, blue = fell out).
export function ContourChart({ detail, femThreshold = 165 }: Props) {
  const colors = useThemeColors();
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
  const H = 240;
  const pad = { l: 40, r: 14, t: 14, b: 40 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const floor = detail.register_floor_hz;
  const { t, hz } = detail.frames;
  const dur = detail.duration_s || t[t.length - 1] || 1;

  const voiced = hz.filter((v): v is number => v != null);
  const maxHz = Math.max(220, ...voiced, femThreshold) * 1.05;
  const minHz = Math.min(80, floor - 20, ...voiced);

  const x = (time: number) => pad.l + (time / dur) * iw;
  const y = (f: number) =>
    pad.t + (1 - (f - minHz) / (maxHz - minHz)) * ih;

  // Build contour segments, split into "in register" vs "crashed" runs so each
  // can be stroked its own color. A run breaks on unvoiced gaps too.
  type Seg = { below: boolean; pts: [number, number][] };
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  for (let i = 0; i < hz.length; i++) {
    const f = hz[i];
    if (f == null) {
      cur = null;
      continue;
    }
    const below = f < floor;
    if (!cur || cur.below !== below) {
      cur = { below, pts: [] };
      segs.push(cur);
    }
    cur.pts.push([x(t[i]), y(f)]);
  }
  const toPath = (pts: [number, number][]) =>
    pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  const yTicks = [minHz, floor, femThreshold, maxHz].filter(
    (v, i, a) => a.indexOf(v) === i && v <= maxHz && v >= minHz,
  );

  return (
    <div ref={wrapRef} className="contour-wrap">
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="contour">
      {/* feminine band (soft pink, above the fem threshold) */}
      <rect
        x={pad.l}
        y={y(maxHz)}
        width={iw}
        height={y(femThreshold) - y(maxHz)}
        fill={zoneColor(FEM, colors)}
        opacity={0.12}
      />
      {/* sub-register band (blue, below the floor) */}
      <rect
        x={pad.l}
        y={y(floor)}
        width={iw}
        height={y(minHz) - y(floor)}
        fill={zoneColor(MASC, colors)}
        opacity={0.22}
      />

      {/* register floor line */}
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={y(floor)}
        y2={y(floor)}
        stroke="#7c9fd6"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <text x={W - pad.r} y={y(floor) - 5} fontSize="10" fill={colors.zoneMascInk} textAnchor="end">
        register floor {floor} Hz
      </text>

      {/* phrase dividers */}
      {detail.phrases.map((p, k) => (
        <line
          key={`d${k}`}
          x1={x(p.end)}
          x2={x(p.end)}
          y1={pad.t}
          y2={pad.t + ih}
          stroke={colors.lineSoft}
          strokeWidth={1}
        />
      ))}

      {/* y ticks */}
      {yTicks.map((v, k) => (
        <text key={`y${k}`} x={pad.l - 6} y={y(v) + 3} fontSize="9" fill={colors.inkSoft} textAnchor="end">
          {Math.round(v)}
        </text>
      ))}

      {/* the contour. The "below floor" branch was already colors.zoneMascInk
          before this task; the other branch used to be a literal (#e07ab0)
          that doesn't blossom-match zoneFem — but this is the same register
          data the phrase-ending dots two blocks below already color via
          zoneColor(FEM/MASC), so it stays wired to the real zone token
          rather than a blossom-pixel-matched one, the same call made for
          ContourIcon's identical masc/fem dip. */}
      {segs.map((s, k) => (
        <path
          key={`s${k}`}
          d={toPath(s.pts)}
          fill="none"
          stroke={s.below ? colors.zoneMascInk : zoneColor(FEM, colors)}
          strokeWidth={s.below ? 3 : 2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={s.below ? 1 : 0.9}
        />
      ))}

      {/* per-phrase landing dots (under each phrase ending) */}
      {detail.phrases.map((p, k) => (
        <circle
          key={`l${k}`}
          cx={x(p.end)}
          cy={pad.t + ih + 14}
          r={4.5}
          fill={zoneColor(p.ended_in_register ? FEM : MASC, colors)}
          stroke={colors.card}
          strokeWidth={1.5}
        >
          <title>
            phrase {k + 1}: ended {p.offset_hz} Hz —{" "}
            {p.ended_in_register ? "landed in register 💕" : "fell out of register"}
          </title>
        </circle>
      ))}
      <text x={pad.l} y={H - 6} fontSize="10" fill={colors.inkSoft}>
        time →
      </text>
      <text x={W - pad.r} y={H - 6} fontSize="10" fill={colors.inkSoft} textAnchor="end">
        ● dots = how each phrase landed
      </text>
    </svg>
    </div>
  );
}
