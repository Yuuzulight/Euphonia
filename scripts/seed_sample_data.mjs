// Generates sample takes for testing the populated dashboard.
//
// Deterministic on purpose: same numbers every run, so screenshots diff cleanly
// and a layout regression is the only thing that can move.
import { pathToFileURL } from "node:url";

// Small deterministic PRNG (mulberry32) — Math.random() would reshuffle the
// contour on every run and make screenshot diffs useless.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOOR = 165; // register floor in Hz, matches the app's default

// One take: a pitch track that mostly sits above the floor, with phrase-final
// drops (the thing the register section is designed to surface).
function makeTake(id, label, date, meanTarget, discipline, seed) {
  const rand = rng(seed);
  const step = 0.01;
  const dur = 18 + Math.round(rand() * 8);
  const t = [], hz = [], phrases = [];

  let time = 0;
  while (time < dur) {
    const phraseLen = 1.4 + rand() * 2.2;
    const gap = 0.25 + rand() * 0.45;
    const start = time;
    const end = Math.min(dur, start + phraseLen);
    // endings sag: `discipline` is how well the voice holds register at phrase end
    const sag = (1 - discipline) * (18 + rand() * 22);
    let minHz = Infinity, onsetHz = 0, offsetHz = 0, sub = 0, n = 0;

    for (let x = start; x < end; x += step) {
      const p = (x - start) / (end - start);
      const melody = Math.sin(p * Math.PI) * 14 + Math.sin(p * 7.3) * 5;
      const drift = (rand() - 0.5) * 7;
      const v = meanTarget + melody + drift - sag * Math.pow(p, 2.4);
      t.push(+x.toFixed(3));
      hz.push(+v.toFixed(2));
      if (n === 0) onsetHz = v;
      offsetHz = v;
      if (v < minHz) minHz = v;
      if (v < FLOOR) sub++;
      n++;
    }
    phrases.push({
      start: +start.toFixed(3), end: +end.toFixed(3),
      onset_hz: +onsetHz.toFixed(1), offset_hz: +offsetHz.toFixed(1),
      min_hz: +minHz.toFixed(1),
      started_in_register: onsetHz >= FLOOR,
      ended_in_register: offsetHz >= FLOOR,
      sub_register_pct: +((sub / Math.max(n, 1)) * 100).toFixed(1),
    });
    // silence between phrases: nulls, so the chart has real gaps to handle
    for (let x = end; x < end + gap && x < dur; x += step) {
      t.push(+x.toFixed(3)); hz.push(null);
    }
    time = end + gap;
  }

  const voiced = hz.filter((v) => v !== null);
  const mean = voiced.reduce((a, b) => a + b, 0) / voiced.length;
  const sorted = [...voiced].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0], max = sorted[sorted.length - 1];
  const sd = Math.sqrt(voiced.reduce((a, b) => a + (b - mean) ** 2, 0) / voiced.length);
  const inReg = (voiced.filter((v) => v >= FLOOR).length / voiced.length) * 100;
  const landed = (phrases.filter((p) => p.ended_in_register).length / phrases.length) * 100;
  const st = (v) => 12 * Math.log2(Math.max(v, 1) / FLOOR);
  const stVals = voiced.map(st);
  const stMean = stVals.reduce((a, b) => a + b, 0) / stVals.length;
  const stSd = Math.sqrt(stVals.reduce((a, b) => a + (b - stMean) ** 2, 0) / stVals.length);

  const register = {
    floor_hz: FLOOR,
    in_register_pct: +inReg.toFixed(1),
    semitones_sd: +stSd.toFixed(2),
    in_register_semitones_sd: +(stSd * 0.72).toFixed(2),
    onset_sub_pct: +(phrases.filter((p) => !p.started_in_register).length / phrases.length * 100).toFixed(1),
    mid_sub_pct: +(((1 - discipline) * 18)).toFixed(1),
    offset_sub_pct: +(phrases.filter((p) => !p.ended_in_register).length / phrases.length * 100).toFixed(1),
    phrases_landed_pct: +landed.toFixed(1),
    n_phrases: phrases.length,
  };

  const detail = {
    register_floor_hz: FLOOR,
    semitone_ref_hz: FLOOR,
    duration_s: +dur.toFixed(2),
    time_step: step,
    frames: { t, hz },
    phrases,
    summary: register,
  };

  return {
    id, label,
    note: "",
    date,
    source_file: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.wav`,
    audio: null, // no fixture audio: the player hides itself rather than 404ing
    duration_s: +dur.toFixed(2),
    pitch: {
      mean_hz: +mean.toFixed(1), median_hz: +median.toFixed(1),
      min_hz: +min.toFixed(1), max_hz: +max.toFixed(1),
      range_hz: +(max - min).toFixed(1), sd_hz: +sd.toFixed(1),
    },
    formants: {
      f1_hz: +(560 + discipline * 90).toFixed(0),
      f2_hz: +(1680 + discipline * 380).toFixed(0),
      f3_hz: +(2790 + discipline * 210).toFixed(0),
    },
    voice_quality: {
      hnr_db: +(17.5 + discipline * 5).toFixed(1),
      jitter_pct: +(2.3 - discipline * 1.1).toFixed(2),
      shimmer_pct: +(8.4 - discipline * 2.8).toFixed(2),
    },
    intensity: {
      mean_db: +(62 + discipline * 4).toFixed(1),
      min_db: +(41 + discipline * 3).toFixed(1),
      max_db: +(76 + discipline * 3).toFixed(1),
    },
    weight: {
      h1a3c_db: +(15.5 - discipline * 8).toFixed(1),
      h1a3_db: +(13.8 - discipline * 7).toFixed(1),
      tilt_db_khz: +(-9.4 + discipline * 2.5).toFixed(2),
    },
    register,
    __detail: detail, // the heavy per-take analysis; goes to the `details` store
  };
}

export function makeTakes() {
  // Deliberately a progression: earliest take is the roughest, latest the best,
  // so the trend charts have a real shape instead of noise.
  return [
    makeTake(1, "Rainbow Passage, first try", "2026-07-02", 158, 0.18, 11),
    makeTake(2, "Rainbow Passage, morning", "2026-07-14", 168, 0.36, 22),
    makeTake(3, "Reading practice", "2026-07-28", 176, 0.55, 33),
    makeTake(4, "Rainbow Passage, warmed up", "2026-08-09", 184, 0.71, 44),
    makeTake(5, "Rainbow Passage, morning", "2026-08-16", 189, 0.83, 55),
  ];
}

// Running this file directly just prints what it would produce — a quick way to
// eyeball the fixture without launching a browser. It writes nothing: fixtures
// go into IndexedDB at runtime (see scripts/lib/seed_browser.mjs), never into
// public/, where recordings.json is tracked as [] and electron-builder
// deliberately filters the path out of the installer.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const t of makeTakes()) {
    console.log(
      `#${t.id} ${t.label.padEnd(30)} mean ${t.pitch.mean_hz} Hz, ` +
        `${t.register.n_phrases} phrases, ${t.register.in_register_pct}% in register`,
    );
  }
}
