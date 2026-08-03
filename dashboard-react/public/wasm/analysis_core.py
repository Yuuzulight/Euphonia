# Ported verbatim from analyze.py's analyze() pipeline (pitch, formants, voice
# quality, intensity, spectral weight) -- same Praat calls, same parameters, so
# results are directly comparable to the desktop app's native output. The only
# things NOT ported here are file I/O, ffmpeg conversion (browser does this via
# Web Audio API instead), and the register/phrasing detail pass -- out of scope
# for this feasibility prototype.

import math
import statistics
import numpy as np
import parselmouth
from parselmouth.praat import call

PITCH_FLOOR = 75.0
PITCH_CEILING = 500.0
FORMANT_CEILING = 5500.0


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return round(float(value), 2)


def _iseli_correction(f_harmonic, f_formant, bw_formant, fs):
    r = math.exp(-math.pi * bw_formant / fs)
    omega = 2 * math.pi * f_formant / fs
    omega_h = 2 * math.pi * f_harmonic / fs
    num = (r**2 - 2 * r * math.cos(omega) + 1) ** 2
    den = (
        (r**2 - 2 * r * math.cos(omega + omega_h) + 1)
        * (r**2 - 2 * r * math.cos(omega - omega_h) + 1)
    )
    if den <= 0 or num <= 0:
        return 0.0
    return 10.0 * math.log10(num / den)


def _harmonic_db(spec_freqs, spec_db, target_hz, f0):
    if target_hz <= 0 or f0 <= 0:
        return None
    half = max(f0 * 0.5, 20.0)
    mask = (spec_freqs >= target_hz - half) & (spec_freqs <= target_hz + half)
    if not mask.any():
        return None
    vals = spec_db[mask]
    peak = float(np.max(vals))
    if math.isnan(peak) or math.isinf(peak):
        return None
    return peak


def spectral_weight(sound):
    fs = sound.sampling_frequency
    dur = sound.get_total_duration()
    pitch = call(sound, "To Pitch", 0.0, PITCH_FLOOR, PITCH_CEILING)
    formant = call(sound, "To Formant (burg)", 0.0, 5, FORMANT_CEILING, 0.025, 50)

    f0s = pitch.selected_array["frequency"]
    ts = pitch.xs()
    voiced = [(float(t), float(f)) for t, f in zip(ts, f0s) if f > 0]
    max_frames = 250
    if len(voiced) > max_frames:
        step = len(voiced) / max_frames
        voiced = [voiced[int(i * step)] for i in range(max_frames)]

    h1a3c_vals = []
    h1a3_vals = []

    for t, f0 in voiced:
        win = max(0.025, 3.0 / f0)
        t0 = t - win / 2
        t1 = t + win / 2
        if t0 < 0 or t1 > dur:
            continue
        try:
            seg = sound.extract_part(t0, t1, parselmouth.WindowShape.HAMMING, 1.0, False)
            spec = seg.to_spectrum()
        except Exception:
            continue
        vals = spec.values
        power = vals[0] ** 2 + vals[1] ** 2
        freqs = np.asarray(spec.xs())
        with np.errstate(divide="ignore"):
            spec_db = 10.0 * np.log10(np.where(power > 0, power, np.nan))

        fb = {}
        ok = True
        for n in (1, 2, 3):
            fn = call(formant, "Get value at time", n, t, "Hertz", "Linear")
            bn = call(formant, "Get bandwidth at time", n, t, "Hertz", "Linear")
            if math.isnan(fn) or math.isnan(bn) or fn <= 0 or bn <= 0:
                ok = False
                break
            fb[n] = (fn, bn)
        if not ok:
            continue

        h1 = _harmonic_db(freqs, spec_db, f0, f0)
        f3 = fb[3][0]
        k3 = max(1, round(f3 / f0))
        a3 = _harmonic_db(freqs, spec_db, k3 * f0, f0)
        if h1 is None or a3 is None:
            continue

        h1_corr = h1
        a3_corr = a3
        for n in (1, 2, 3):
            fn, bn = fb[n]
            h1_corr -= _iseli_correction(f0, fn, bn, fs)
            a3_corr -= _iseli_correction(k3 * f0, fn, bn, fs)

        h1a3c = h1_corr - a3_corr
        h1a3 = h1 - a3
        if not (math.isnan(h1a3c) or math.isinf(h1a3c)):
            h1a3c_vals.append(h1a3c)
        if not (math.isnan(h1a3) or math.isinf(h1a3)):
            h1a3_vals.append(h1a3)

    h1a3c = float(np.mean(h1a3c_vals)) if h1a3c_vals else None
    h1a3 = float(np.mean(h1a3_vals)) if h1a3_vals else None

    tilt = None
    try:
        ltas = call(sound, "To Ltas", 100.0)
        freqs_l = []
        vals_l = []
        for f in range(100, 5001, 100):
            v = call(ltas, "Get value at frequency", float(f), "Linear")
            if not (math.isnan(v) or math.isinf(v)):
                freqs_l.append(float(f))
                vals_l.append(v)
        if len(freqs_l) >= 4:
            tilt = float(np.polyfit(np.array(freqs_l), np.array(vals_l), 1)[0] * 1000.0)
    except Exception:
        tilt = None

    return {
        "h1a3c_db": clean(h1a3c),
        "h1a3_db": clean(h1a3),
        "tilt_db_khz": clean(tilt),
    }


def vowel_formants(sound, pitch):
    f0s = pitch.selected_array["frequency"]
    ts = pitch.xs()
    voiced_idx = [i for i, f in enumerate(f0s) if f > 0]
    if not voiced_idx:
        return {1: None, 2: None, 3: None}

    intensity = call(sound, "To Intensity", PITCH_FLOOR, 0, "yes")
    int_vals = intensity.values[0]
    int_ts = intensity.xs()
    int_max = float(np.nanmax(int_vals))
    loud_floor = int_max - 10.0

    def int_at(t):
        j = int(np.searchsorted(int_ts, t))
        j = min(max(j, 0), len(int_vals) - 1)
        return float(int_vals[j])

    cand_ts = [float(ts[i]) for i in voiced_idx if int_at(float(ts[i])) >= loud_floor]
    max_frames = 300
    if len(cand_ts) > max_frames:
        step = len(cand_ts) / max_frames
        cand_ts = [cand_ts[int(k * step)] for k in range(max_frames)]

    def measure(ceiling):
        formant = call(sound, "To Formant (burg)", 0.0, 5, ceiling, 0.025, 50)
        rows = []
        for t in cand_ts:
            vals = []
            ok = True
            for n in (1, 2, 3):
                v = formant.get_value_at_time(n, t)
                if math.isnan(v) or v <= 0:
                    ok = False
                    break
                vals.append(v)
            if not ok:
                continue
            f1, f2, f3 = vals
            if not (250.0 <= f1 <= 1000.0):
                continue
            rows.append((t, f1, f2, f3))
        out = {1: [], 2: [], 3: []}
        prev_f2 = None
        for _t, f1, f2, f3 in rows:
            if prev_f2 is not None and abs(f2 - prev_f2) > 150.0:
                prev_f2 = f2
                continue
            out[1].append(f1)
            out[2].append(f2)
            out[3].append(f3)
            prev_f2 = f2
        return out

    best = None
    best_spread = float("inf")
    for ceiling in (FORMANT_CEILING, 5000.0):
        fv = measure(ceiling)
        if len(fv[2]) < 5:
            continue
        spread = statistics.pstdev(fv[2])
        if spread < best_spread:
            best_spread = spread
            best = fv
    if best is None:
        best = measure(FORMANT_CEILING)

    return {n: (statistics.median(best[n]) if best[n] else None) for n in (1, 2, 3)}


def analyze(sound):
    duration = sound.get_total_duration()

    pitch = call(sound, "To Pitch", 0.0, PITCH_FLOOR, PITCH_CEILING)
    mean_f0 = call(pitch, "Get mean", 0, 0, "Hertz")
    min_f0 = call(pitch, "Get minimum", 0, 0, "Hertz", "Parabolic")
    max_f0 = call(pitch, "Get maximum", 0, 0, "Hertz", "Parabolic")
    sd_f0 = call(pitch, "Get standard deviation", 0, 0, "Hertz")
    median_f0 = call(pitch, "Get quantile", 0, 0, 0.5, "Hertz")

    mean_formant = vowel_formants(sound, pitch)

    harmonicity = call(sound, "To Harmonicity (cc)", 0.01, PITCH_FLOOR, 0.1, 1.0)
    hnr = call(harmonicity, "Get mean", 0, 0)

    point_process = call(sound, "To PointProcess (periodic, cc)", PITCH_FLOOR, PITCH_CEILING)
    jitter = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
    shimmer = call(
        [sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6
    )

    intensity = call(sound, "To Intensity", PITCH_FLOOR, 0, "yes")
    mean_int = call(intensity, "Get mean", 0, 0, "energy")
    min_int = call(intensity, "Get minimum", 0, 0, "Parabolic")
    max_int = call(intensity, "Get maximum", 0, 0, "Parabolic")

    return {
        "duration_s": clean(duration),
        "pitch": {
            "mean_hz": clean(mean_f0),
            "median_hz": clean(median_f0),
            "min_hz": clean(min_f0),
            "max_hz": clean(max_f0),
            "range_hz": clean(max_f0 - min_f0) if not (math.isnan(min_f0) or math.isnan(max_f0)) else None,
            "sd_hz": clean(sd_f0),
        },
        "formants": {
            "f1_hz": clean(mean_formant[1]),
            "f2_hz": clean(mean_formant[2]),
            "f3_hz": clean(mean_formant[3]),
        },
        "voice_quality": {
            "hnr_db": clean(hnr),
            "jitter_pct": clean(jitter * 100 if not math.isnan(jitter) else None),
            "shimmer_pct": clean(shimmer * 100 if not math.isnan(shimmer) else None),
        },
        "intensity": {
            "mean_db": clean(mean_int),
            "min_db": clean(min_int),
            "max_db": clean(max_int),
        },
        "weight": spectral_weight(sound),
    }
