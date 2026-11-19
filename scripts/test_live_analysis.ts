// Smoke test for dashboard-react/src/live/analysis.ts, the live visualiser's
// DSP (the one piece of non-trivial logic behind the "Live" button).
// Run directly: `node scripts/test_live_analysis.ts`. Node strips the types,
// no build step. 8 kHz throughout, matching wavesurfer's decode rate.
import assert from "node:assert";
import { estimateF0, hann, magnitudeAt } from "../dashboard-react/src/live/analysis.ts";

const SR = 8000;

function tone(hz: number, n: number, harmonics = 1): Float32Array {
  const out = new Float32Array(n);
  for (let k = 1; k <= harmonics; k++) {
    for (let i = 0; i < n; i++) out[i] += Math.sin((2 * Math.PI * hz * k * i) / SR) / k;
  }
  return out;
}

// Deterministic pseudo-noise (seeded LCG) so the aperiodic case can't flake.
function noise(n: number, seed = 1): Float32Array {
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = s / 0x3fffffff - 1;
  }
  return out;
}

function windowed(samples: Float32Array): Float32Array {
  const win = hann(samples.length);
  return samples.map((v, i) => v * win[i]);
}

function test_f0_of_pure_tone() {
  assert.ok(Math.abs(estimateF0(tone(220, 512), SR)! - 220) < 4);
  assert.ok(Math.abs(estimateF0(tone(110, 512), SR)! - 110) < 4);
}

function test_f0_ignores_harmonics() {
  // a rich 165 Hz source still reports its fundamental, not a formant
  assert.ok(Math.abs(estimateF0(tone(165, 512, 6), SR)! - 165) < 5);
}

function test_f0_of_silence_and_noise_is_null() {
  assert.strictEqual(estimateF0(new Float32Array(512), SR), null);
  assert.strictEqual(estimateF0(noise(512), SR), null);
}

function test_hann_window_shape() {
  const w = hann(1024);
  assert.ok(w[0] < 0.001);
  assert.ok(w[1023] < 0.001);
  assert.ok(Math.abs(w[512] - 1) < 0.001);
}

function test_magnitude_peaks_at_the_tone() {
  const win = windowed(tone(440, 1024));
  const at = magnitudeAt(win, SR, 440);
  assert.ok(at > magnitudeAt(win, SR, 220) * 8);
  assert.ok(at > magnitudeAt(win, SR, 880) * 8);
}

function test_full_scale_sine_is_about_half() {
  // the component's dB scale (-6 dB at the top) is calibrated against this
  const mag = magnitudeAt(windowed(tone(300, 1024)), SR, 300);
  assert.ok(mag > 0.4 && mag < 0.6, `expected ~0.5, got ${mag}`);
}

function test_harmonic_series_falls_off() {
  const win = windowed(tone(200, 1024, 4));
  const h1 = magnitudeAt(win, SR, 200);
  const h2 = magnitudeAt(win, SR, 400);
  const h3 = magnitudeAt(win, SR, 600);
  assert.ok(h1 > h2 && h2 > h3, `expected 1/k roll-off, got ${h1} ${h2} ${h3}`);
}

const tests = [
  test_f0_of_pure_tone,
  test_f0_ignores_harmonics,
  test_f0_of_silence_and_noise_is_null,
  test_hann_window_shape,
  test_magnitude_peaks_at_the_tone,
  test_full_scale_sine_is_about_half,
  test_harmonic_series_falls_off,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
    console.log(`[OK] ${test.name}`);
  } catch (e) {
    failed++;
    console.error(`[FAIL] ${test.name}: ${(e as Error).message}`);
  }
}
if (failed > 0) {
  console.error(`${failed}/${tests.length} tests failed`);
  process.exit(1);
}
console.log(`${tests.length}/${tests.length} tests passed`);
