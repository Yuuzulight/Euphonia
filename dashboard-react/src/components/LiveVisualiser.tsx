import { useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import { useThemeColors, type ThemeColors } from "../theme/ThemeProvider";
import { FEM, MASC, BUTTER, zoneColor, type ZoneColorKey } from "../zones";
import { estimateF0, hann, magnitudeAt } from "../live/analysis";

// Live pitch + harmonics visualiser for the player (see ARCHITECTURE.md's
// "Live visualiser" section).
//
// It reads wavesurfer's own decoded buffer at the playhead rather than tapping
// the audio element with an AnalyserNode: no second audio graph to route (and
// risk silencing) playback, no autoplay-policy games, and it still draws while
// paused or scrubbed. Cost is one windowed DFT + one autocorrelation per frame
// over a 1 kB window. See live/analysis.ts.

export type LiveMode = "off" | "pitch" | "harmonics" | "both";
type ViewMode = Exclude<LiveMode, "off">;

const PITCH_LO = 70; // Hz, bottom of the pitch axis
const PITCH_HI = 400; // Hz, top of the pitch axis
const FEM_FLOOR = 165; // Hz, PITCH_ZONES' fem floor, drawn as the goal line
const FREQ_LO = 80; // Hz, left edge of the spectrum axis
const FREQ_HI = 4000; // Hz, right edge (the decoded buffer's Nyquist)
const TRACE_LEN = 240; // ~4 s of pitch history at 60 fps
const PITCH_N = 512; // 64 ms @ 8 kHz
const SPEC_N = 1024; // 128 ms @ 8 kHz → 7.8 Hz bins, enough to split harmonics
const PROBES = 150; // spectrum points across the log axis
// The spectrum is drawn relative to the frame's own loudest bin (peaks at the
// top, SPEC_RANGE_DB below them at the floor) so a quiet take reads the same
// shape as a loud one; SILENCE_DB stops a near-silent frame from boosting its
// own noise floor into a full-height curve.
const SPEC_RANGE_DB = 55;
const SILENCE_DB = -60;
const FONT = '9px ui-rounded, "SF Pro Rounded", "Quicksand", system-ui, sans-serif';

// Same meaning as the metric bars' zones (zones.ts): blue only for the
// masculine end, pink for the fem end you're aiming at.
const PITCH_BANDS: [number, number, ZoneColorKey][] = [
  [PITCH_LO, 145, MASC],
  [145, FEM_FLOOR, BUTTER],
  [FEM_FLOOR, PITCH_HI, FEM],
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const xOfFreq = (hz: number, r: Rect) =>
  r.x + r.w * (Math.log(hz / FREQ_LO) / Math.log(FREQ_HI / FREQ_LO));
const yOfPitch = (hz: number, r: Rect) =>
  r.y + r.h * (1 - Math.log(hz / PITCH_LO) / Math.log(PITCH_HI / PITCH_LO));
const db = (mag: number) => 20 * Math.log10(mag + 1e-9);
/** Height of a bin on the spectrum's frame-relative dB scale. */
const yOfDb = (mag: number, r: Rect, ref: number) =>
  r.y + r.h * (1 - clamp((db(mag) - (ref - SPEC_RANGE_DB)) / SPEC_RANGE_DB, 0, 1));

function drawPitch(
  c: CanvasRenderingContext2D,
  r: Rect,
  colors: ThemeColors,
  trace: (number | null)[],
) {
  for (const [from, to, key] of PITCH_BANDS) {
    const top = yOfPitch(to, r);
    c.globalAlpha = 0.16;
    c.fillStyle = zoneColor(key, colors);
    c.fillRect(r.x, top, r.w, yOfPitch(from, r) - top);
  }
  c.globalAlpha = 1;

  c.font = FONT;
  c.fillStyle = colors.inkFaint;
  c.strokeStyle = colors.lineSoft;
  c.lineWidth = 1;
  for (const hz of [100, 200, 300]) {
    const y = yOfPitch(hz, r);
    c.beginPath();
    c.moveTo(r.x, y);
    c.lineTo(r.x + r.w, y);
    c.stroke();
    c.fillText(`${hz}`, r.x + 2, y - 2);
  }
  // the goal line: where a take stops reading as chest voice
  c.setLineDash([3, 3]);
  c.strokeStyle = zoneColor(FEM, colors);
  c.beginPath();
  c.moveTo(r.x, yOfPitch(FEM_FLOOR, r));
  c.lineTo(r.x + r.w, yOfPitch(FEM_FLOOR, r));
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = colors.inkSoft;
  c.fillText(`${FEM_FLOOR} Hz · fem floor`, r.x + r.w - 92, yOfPitch(FEM_FLOOR, r) - 3);

  // newest sample sits at the right edge, so the trace grows in from the left
  const step = r.w / TRACE_LEN;
  const x0 = r.x + r.w - trace.length * step;
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.strokeStyle = colors.waveProgress;
  c.beginPath();
  let pen = false;
  trace.forEach((v, i) => {
    if (v === null) {
      pen = false; // unvoiced gap: break the line rather than invent a value
      return;
    }
    const x = x0 + i * step;
    const y = clamp(yOfPitch(v, r), r.y, r.y + r.h);
    if (pen) c.lineTo(x, y);
    else {
      c.moveTo(x, y);
      pen = true;
    }
  });
  c.stroke();

  const now = trace[trace.length - 1];
  if (now != null) {
    c.fillStyle = colors.waveCursor;
    c.beginPath();
    c.arc(x0 + (trace.length - 1) * step, clamp(yOfPitch(now, r), r.y, r.y + r.h), 3, 0, 2 * Math.PI);
    c.fill();
  }
}

function drawSpectrum(
  c: CanvasRenderingContext2D,
  r: Rect,
  colors: ThemeColors,
  curve: Float32Array,
  ref: number,
) {
  c.font = FONT;
  c.fillStyle = colors.inkFaint;
  c.strokeStyle = colors.lineSoft;
  c.lineWidth = 1;
  for (const hz of [100, 500, 1000, 2000, 4000]) {
    const x = xOfFreq(hz, r);
    c.beginPath();
    c.moveTo(x, r.y);
    c.lineTo(x, r.y + r.h);
    c.stroke();
    c.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, x + 2, r.y + r.h - 2);
  }

  c.beginPath();
  for (let i = 0; i < PROBES; i++) {
    const x = r.x + (r.w * i) / (PROBES - 1);
    const y = yOfDb(curve[i], r, ref);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.lineWidth = 1.8;
  c.lineJoin = "round";
  c.strokeStyle = colors.wave;
  c.stroke();
  c.lineTo(r.x + r.w, r.y + r.h);
  c.lineTo(r.x, r.y + r.h);
  c.closePath();
  c.globalAlpha = 0.22;
  c.fillStyle = colors.wave;
  c.fill();
  c.globalAlpha = 1;
}

function drawHarmonics(
  c: CanvasRenderingContext2D,
  r: Rect,
  colors: ThemeColors,
  marks: { hz: number; mag: number }[],
  ref: number,
) {
  c.font = FONT;
  for (let i = 0; i < marks.length; i++) {
    const { hz, mag } = marks[i];
    const x = xOfFreq(hz, r);
    const y = yOfDb(mag, r, ref);
    c.setLineDash([2, 3]);
    c.strokeStyle = colors.inkFaint;
    c.beginPath();
    c.moveTo(x, r.y + r.h);
    c.lineTo(x, y);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = i === 0 ? colors.waveCursor : colors.inkAccent;
    c.beginPath();
    c.arc(x, y, i === 0 ? 3 : 2, 0, 2 * Math.PI);
    c.fill();
    // skip the label where harmonics crowd together and it would overlap,
    // keep it inside the canvas at the right edge, and drop it below the dot
    // when the dot is at the very top (H1 on a loud frame sits up there)
    if (xOfFreq(marks[i + 1]?.hz ?? FREQ_HI + 1, r) - x > 20) {
      c.fillStyle = colors.inkSoft;
      c.fillText(`H${i + 1}`, Math.min(x + 3, r.x + r.w - 16), y - 3 < r.y + 9 ? y + 11 : y - 3);
    }
  }
}

function layout(mode: ViewMode, w: number, h: number): { pitch: Rect | null; spec: Rect | null } {
  if (mode === "pitch") return { pitch: { x: 0, y: 0, w, h }, spec: null };
  if (mode === "harmonics") return { pitch: null, spec: { x: 0, y: 0, w, h } };
  const top = Math.round(h * 0.38);
  return { pitch: { x: 0, y: 0, w, h: top }, spec: { x: 0, y: top + 8, w, h: h - top - 8 } };
}

function readoutText(mode: ViewMode, hz: number | null, marks: { hz: number }[]): string {
  const pitch = hz ? `${Math.round(hz)} Hz` : "—";
  if (mode === "pitch") return pitch;
  const hs = marks
    .slice(0, 4)
    .map((m, i) => `H${i + 1} ${Math.round(m.hz)}`)
    .join(" · ");
  return mode === "harmonics" ? hs || "—" : `${pitch} · ${hs}`;
}

export function LiveVisualiser({
  ws,
  mode,
}: {
  ws: WaveSurfer | null;
  mode: ViewMode;
}) {
  const colors = useThemeColors();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const traceRef = useRef<(number | null)[]>([]);
  const drawnTRef = useRef(-1);
  const [readout, setReadout] = useState("—");

  // Read through a ref so a theme change doesn't restart the animation loop.
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // Repaint on a theme change even while parked on a paused frame.
  useEffect(() => {
    drawnTRef.current = -1;
  }, [colors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ws) return;

    const win = hann(SPEC_N);
    const slice = new Float32Array(SPEC_N);
    const pitchSlice = new Float32Array(PITCH_N);
    const curve = new Float32Array(PROBES);
    const marks: { hz: number; mag: number }[] = [];
    // The pitch estimate is needed in every mode (the harmonics view places its
    // markers at k·F0); the 150-probe spectrum is the expensive half, so skip
    // that when nothing draws it.
    const wantSpec = mode !== "pitch";
    let raf = 0;
    let lastT = -1;
    let lastText = 0;

    const draw = (t: number) => {
      const c = canvas.getContext("2d");
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!c || !w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);

      const colors = colorsRef.current;
      const buf = ws.getDecodedData(); // null until wavesurfer finishes decoding
      let hz: number | null = null;
      let ref = SILENCE_DB;
      marks.length = 0;

      if (buf) {
        const sr = buf.sampleRate;
        const data = buf.getChannelData(0);
        const at = Math.round(t * sr);

        // Pitch: a short raw (unwindowed) slice at the playhead.
        const pStart = clamp(at - PITCH_N / 2, 0, Math.max(0, data.length - PITCH_N));
        const pLen = Math.min(PITCH_N, data.length - pStart);
        for (let i = 0; i < pLen; i++) pitchSlice[i] = data[pStart + i];
        if (pLen > 0) hz = estimateF0(pitchSlice.subarray(0, pLen), sr);

        if (wantSpec) {
          const start = clamp(at - SPEC_N / 2, 0, Math.max(0, data.length - SPEC_N));
          const n = Math.min(SPEC_N, data.length - start);
          slice.fill(0);
          for (let i = 0; i < n; i++) slice[i] = data[start + i] * win[i];
          for (let i = 0; i < PROBES; i++) {
            const f = FREQ_LO * Math.pow(FREQ_HI / FREQ_LO, i / (PROBES - 1));
            curve[i] = magnitudeAt(slice, sr, f);
          }
          let peak = 0;
          for (let i = 0; i < PROBES; i++) if (curve[i] > peak) peak = curve[i];
          ref = Math.max(db(peak), SILENCE_DB);
          if (hz) {
            for (let k = 1; k * hz <= FREQ_HI; k++) {
              marks.push({ hz: k * hz, mag: magnitudeAt(slice, sr, k * hz) });
            }
          }
        }
      } else {
        curve.fill(0); // no decoded buffer yet: nothing to scale a spectrum against
      }

      // One history sample per playhead position, so a pause doesn't add a run
      // of duplicate flat points to the trace.
      if (t !== lastT) {
        lastT = t;
        const trace = traceRef.current;
        trace.push(hz);
        if (trace.length > TRACE_LEN) trace.splice(0, trace.length - TRACE_LEN);
      }

      const rects = layout(mode, w, h);
      if (rects.pitch) drawPitch(c, rects.pitch, colors, traceRef.current);
      if (rects.spec) {
        drawSpectrum(c, rects.spec, colors, curve, ref);
        drawHarmonics(c, rects.spec, colors, marks, ref);
      }

      // Throttled: re-rendering React 60×/s for a text string is not worth it.
      const now = performance.now();
      if (now - lastText > 120) {
        lastText = now;
        setReadout(readoutText(mode, hz, marks));
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = ws.getCurrentTime();
      // Redraw only when the playhead moved: while paused that keeps the frame
      // you're parked on (or scrubbed to) on screen, and costs nothing when idle.
      if (t === drawnTRef.current) return;
      drawnTRef.current = t;
      draw(t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ws, mode]);

  return (
    <div className="viz-panel">
      <canvas ref={canvasRef} className="viz-canvas" aria-hidden="true" />
      <span className="viz-readout">{readout}</span>
    </div>
  );
}
