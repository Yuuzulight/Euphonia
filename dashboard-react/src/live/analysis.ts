// The live visualiser's DSP: pure functions over a window of samples, no DOM
// and no audio graph, so scripts/test_live_analysis.ts can check them against
// synthetic tones. The sample rate is whatever wavesurfer decoded at (8 kHz,
// see WaveformPlayer), which is why the spectrum axis stops at 4 kHz: enough
// for F0 and F1–F3, and nothing above it to show anyway.

/** Hann window: without it, one harmonic smears across its neighbours at
 *  1 kHz+ on a 1024-sample window. */
export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Magnitude of one frequency bin (Goertzel: a single DFT bin, no full FFT,
 *  as the visualiser only needs ~150 points on a log axis). `win` must already be
 *  windowed. Scaled so a full-scale sine reads ~0.5 under a Hann window, which
 *  is what the component's dB scale is calibrated against. */
export function magnitudeAt(win: Float32Array, sampleRate: number, hz: number): number {
  const c = 2 * Math.cos((2 * Math.PI * hz) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < win.length; i++) {
    const s0 = win[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - c * s1 * s2;
  // 2/N: a real sine's bin holds half its energy, and the Hann window halves
  // that again, so this puts a full-scale tone at 0.5, not 0.25.
  return (2 * Math.sqrt(Math.max(0, power))) / win.length;
}

/** Autocorrelation pitch estimate (Hz) for one frame, or null when the frame is
 *  too quiet or too aperiodic to call a pitch. Pass raw (unwindowed) samples,
 *  a window function flattens the very correlation being measured. Integer-lag
 *  resolution (~4 Hz at 200 Hz / 8 kHz), plenty for a live readout, so no peak
 *  interpolation. */
export function estimateF0(
  buf: Float32Array,
  sampleRate: number,
  minHz = 60,
  maxHz = 400,
): number | null {
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  energy /= buf.length;
  if (Math.sqrt(energy) < 0.01) return null; // silence or room noise

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), buf.length >> 1);
  const acf = new Float32Array(maxLag + 2);
  let best = -1;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const n = buf.length - lag;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += buf[i] * buf[i + lag];
    // normalised, so 1 = perfectly periodic at this lag. The shrinking overlap
    // would otherwise bias the comparison between lags.
    acf[lag] = sum / (n * energy);
    if (acf[lag] > best) {
      best = acf[lag];
      bestLag = lag;
    }
  }
  if (best < 0.5) return null; // unvoiced or noise: nothing to call a pitch

  // The *first* peak nearly as tall as the best one is the period itself,
  // later peaks of equal height are its multiples, and taking one of those
  // reads an octave low.
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (acf[lag] >= 0.9 * best && acf[lag] > acf[lag - 1] && acf[lag] >= acf[lag + 1]) {
      return sampleRate / lag;
    }
  }
  return sampleRate / bestLag;
}
