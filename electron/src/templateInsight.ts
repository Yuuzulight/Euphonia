import { PITCH_ZONES, F2_ZONES, HNR_ZONES, JITTER_ZONES, WEIGHT_ZONES, zoneOf } from "./zones";
import type { RecordingSummary } from "./gemini";

// Deterministic, zero-network insight generator. Reads the SAME zone
// classification the Gemini prompt uses (zones.ts), so it can never get a
// metric's direction backwards or silently skip one the way the local-model
// prototype did — it isn't inferring anything, just describing pre-computed
// facts. This is the default insight (no API key required); Gemini remains
// available as an opt-in "richer, more personalized" upgrade (see insights.ts).

interface Signal {
  metric: string;
  good: boolean;
  // Priority for picking the ONE focus_area when multiple things need work —
  // lower number = surfaced first. Mirrors CLAUDE.md's own guidance that
  // trailing-off phrase endings are "the classic, high-salience failure."
  priority: number;
  strengthText?: string;
  weaknessText?: string;
  tip?: string;
}

function buildSignals(r: RecordingSummary): Signal[] {
  const pitchZone = zoneOf(PITCH_ZONES, r.pitch.mean_hz);
  const f2Zone = zoneOf(F2_ZONES, r.formants.f2_hz);
  const hnrZone = zoneOf(HNR_ZONES, r.voice_quality.hnr_db);
  const jitterZone = zoneOf(JITTER_ZONES, r.voice_quality.jitter_pct);
  const weightZone = zoneOf(WEIGHT_ZONES, r.weight?.h1a3c_db);
  const offsetSub = r.register?.offset_sub_pct;
  const phrasesLanded = r.register?.phrases_landed_pct;

  const signals: Signal[] = [];

  if (offsetSub !== null && offsetSub !== undefined) {
    signals.push({
      metric: "phrase endings",
      good: offsetSub < 20,
      priority: 1,
      strengthText: "your phrase endings stayed in register nicely",
      weaknessText: "your voice tends to fall out of register right at the end of phrases",
      tip: "keep your pitch gently lifted through the very last word of each sentence — it's easy to let it drop once you're running out of breath, so try leaving a little air in reserve for the ending.",
    });
  } else if (phrasesLanded !== null && phrasesLanded !== undefined) {
    signals.push({
      metric: "phrase endings",
      good: phrasesLanded >= 70,
      priority: 1,
      strengthText: "most of your phrase endings landed right in register",
      weaknessText: "phrase endings are where things slip most often",
      tip: "keep your pitch gently lifted through the very last word of each sentence, saving a little breath for the ending instead of trailing off.",
    });
  }

  if (jitterZone) {
    signals.push({
      metric: "steadiness",
      good: jitterZone === "steady",
      priority: 2,
      strengthText: "your voice held steady, cycle to cycle",
      weaknessText: "your voice has some waver in it (jitter)",
      tip: "sustain a single vowel for about 10 seconds, aiming for one smooth, unwavering tone from start to finish.",
    });
  }

  if (weightZone) {
    signals.push({
      metric: "vocal weight",
      good: weightZone === "light",
      priority: 3,
      strengthText: "your voice has a light, airy quality to it",
      weaknessText: "your voice is sitting on the heavier end right now",
      tip: 'try a gentle "sigh" onset on your first few words — starting softer and letting volume build, rather than pushing from the chest.',
    });
  }

  if (pitchZone) {
    signals.push({
      metric: "pitch",
      good: pitchZone === "fem",
      priority: 4,
      strengthText: "your average pitch is comfortably in a feminine range",
      weaknessText: "your average pitch is sitting lower than your target range",
      tip: "hum gently upward into a slightly higher, lighter placement before you start speaking, then carry that same placement into your sentences.",
    });
  }

  if (f2Zone) {
    signals.push({
      metric: "resonance",
      good: f2Zone === "bright",
      priority: 5,
      strengthText: "your resonance reads bright and forward",
      weaknessText: "your resonance is sitting deeper than your target range",
      tip: "try speaking with a slight smile — it naturally brightens resonance by shortening the vocal tract.",
    });
  }

  if (hnrZone) {
    signals.push({
      metric: "clarity",
      good: hnrZone === "clear",
      priority: 6,
      strengthText: "your voice comes through clear, not breathy",
      weaknessText: "your voice reads a bit breathy right now",
      tip: "focus on a clean, definite onset for each word — start with a clear attack rather than easing in with extra air.",
    });
  }

  return signals;
}

export function generateTemplateInsight(
  r: RecordingSummary,
): { summary: string; strengths: string[]; focus_area: string; tip: string } {
  const signals = buildSignals(r);
  const strengths = signals.filter((s) => s.good && s.strengthText).map((s) => s.strengthText!);
  const weaknesses = signals
    .filter((s) => !s.good && s.weaknessText)
    .sort((a, b) => a.priority - b.priority);

  const topWeakness = weaknesses[0];

  const strengthsList = strengths.slice(0, 3);
  const summaryOpening = `Take #${r.id}${r.label ? ` ("${r.label}")` : ""} — here's what the numbers show.`;

  let summary: string;
  let focusArea: string;
  let tip: string;

  if (topWeakness) {
    const strengthClause = strengthsList.length
      ? `The strongest part of this take: ${strengthsList[0]}.`
      : "There's a solid foundation to build on here.";
    summary = `${summaryOpening} ${strengthClause} The clearest place to focus next is ${topWeakness.metric} — ${topWeakness.weaknessText}, and that's the single most doable thing to work on from this take.`;
    focusArea = `${topWeakness.metric.charAt(0).toUpperCase() + topWeakness.metric.slice(1)}: ${topWeakness.weaknessText}.`;
    tip = topWeakness.tip ?? "Keep practicing with the same passage so your takes stay comparable over time.";
  } else {
    summary = `${summaryOpening} Every metric on this take is landing where you want it — ${strengthsList.slice(0, 2).join(" and ") || "everything's tracking well"}. Nothing here needs urgent attention; the best next step is just banking more takes so you can watch the trend hold steady.`;
    focusArea = "Consistency across takes — nothing here needs fixing, just keep practicing to lock it in.";
    tip = "Record a few more takes of the same passage over the next week so you can see this consistency on the Trends chart, not just in one snapshot.";
  }

  if (strengthsList.length === 0) {
    strengthsList.push("you showed up and recorded a take — that's the part that actually moves the needle over time.");
  }

  return { summary, strengths: strengthsList, focus_area: focusArea, tip };
}
