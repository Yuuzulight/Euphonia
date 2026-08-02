import { getApiKey } from "./settings";
import { PITCH_ZONES, F2_ZONES, HNR_ZONES, JITTER_ZONES, WEIGHT_ZONES, zoneOf } from "./zones";

export interface RecordingSummary {
  id: number;
  label: string;
  pitch: { mean_hz: number | null };
  formants: { f2_hz: number | null };
  voice_quality: { hnr_db: number | null; jitter_pct: number | null };
  weight?: { h1a3c_db: number | null };
  register?: {
    in_register_pct: number | null;
    offset_sub_pct: number | null;
    phrases_landed_pct: number | null;
  };
}

// "gemini-2.5-flash" (per the task brief) 404s as "no longer available to new
// users" against the verification key — swapped to the "-latest" alias Google
// keeps pointed at a current flash model so this doesn't rot again.
const GEMINI_MODEL = "gemini-flash-latest";
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    focus_area: { type: "STRING" },
    tip: { type: "STRING" },
  },
  required: ["summary", "strengths", "focus_area", "tip"],
};

function zoneLabel(name: string | null, meaning: string): string {
  return name ? `${name} (${meaning})` : "n/a";
}

function buildPrompt(r: RecordingSummary): string {
  // Each metric is handed over pre-classified into its zone (same thresholds
  // as dashboard-react's own color-coded cards — see electron/src/zones.ts),
  // not just a raw number. Some of these directions are genuinely
  // non-obvious (vocal weight is inverted from what you'd guess), and a
  // model left to infer that itself can get it backwards — feeding it the
  // already-correct verdict turns "must know domain thresholds" into "turn
  // an already-correct fact into prose," which is a much more reliable task.
  const pitchZone = zoneOf(PITCH_ZONES, r.pitch.mean_hz);
  const f2Zone = zoneOf(F2_ZONES, r.formants.f2_hz);
  const hnrZone = zoneOf(HNR_ZONES, r.voice_quality.hnr_db);
  const jitterZone = zoneOf(JITTER_ZONES, r.voice_quality.jitter_pct);
  const weightZone = zoneOf(WEIGHT_ZONES, r.weight?.h1a3c_db);

  return `You are a warm, encouraging voice-feminization coach. Numbers are a
compass, not a judge — always pair any weakness with one concrete, doable
next step, and end warm. Never use the word "masculine" as a generic
put-down; it only applies literally to register crashes.

This take (#${r.id}, "${r.label}"). Each metric includes its value AND its
pre-classified zone — trust the zone label as the correct interpretation,
don't re-derive it from the raw number yourself:

- pitch: ${r.pitch.mean_hz ?? "n/a"} Hz — zone: ${zoneLabel(pitchZone, "fem = feminine/good end, masc = deeper/needs-work end, neutral = in between")}
- resonance F2: ${r.formants.f2_hz ?? "n/a"} Hz — zone: ${zoneLabel(f2Zone, "bright = feminine/good end, deeper = needs-work end")}
- clarity (HNR): ${r.voice_quality.hnr_db ?? "n/a"} dB — zone: ${zoneLabel(hnrZone, "clear = good, breathy = room to grow")}
- steadiness (jitter): ${r.voice_quality.jitter_pct ?? "n/a"}% — zone: ${zoneLabel(jitterZone, "steady = good, rough = room to grow")}
- vocal weight (spectral tilt): ${r.weight?.h1a3c_db ?? "n/a"} dB — zone: ${zoneLabel(weightZone, "light = feminine/good end, heavy = needs-work end — smaller numbers are BETTER here, trust the zone label over your instinct about the number")}
- % time in register: ${r.register?.in_register_pct ?? "n/a"}% (higher is better)
- sub-register at phrase endings: ${r.register?.offset_sub_pct ?? "n/a"}% (lower is better — this is usually the biggest lever)
- phrase endings landed in register: ${r.register?.phrases_landed_pct ?? "n/a"}% (higher is better)

Write a short summary (2-3 sentences), 2-3 genuine strengths, one clear
focus_area naming the single most clockable thing to work on, and one
concrete tip (a specific, doable exercise). Base your interpretation on the
zone labels given above, not on assumptions about whether a raw number
"sounds" high or low.`;
}

/** Calls the real Gemini API. Throws if there's no key, if the request
 * fails, or if the response can't be parsed — callers decide what to do
 * with that (insights.ts falls back to the template generator). */
export async function generateFromGemini(
  r: RecordingSummary,
): Promise<{ summary: string; strengths: string[]; focus_area: string; tip: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(r) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini API returned no content");
  return JSON.parse(text);
}
