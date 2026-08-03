// Ported from electron/src/gemini.ts -- same prompt, same schema, same
// model. The only real difference from the desktop app: the API key lives in
// localStorage (getApiKey/setApiKey below), not OS-level encrypted storage,
// since a browser tab has no safeStorage equivalent. Called directly from
// the client (Gemini's REST endpoint accepts browser-origin requests with a
// key in the query string), so there's no server component here either.

import { PITCH_ZONES, F2_ZONES, HNR_ZONES, JITTER_ZONES, WEIGHT_ZONES, zoneOf } from "../zones";
import type { Recording } from "../types";

const API_KEY_STORAGE_KEY = "euphonia.geminiApiKey";

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

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

function buildPrompt(r: Recording): string {
  const pitchZone = zoneOf(PITCH_ZONES, r.pitch.mean_hz)?.name ?? null;
  const f2Zone = zoneOf(F2_ZONES, r.formants.f2_hz)?.name ?? null;
  const hnrZone = zoneOf(HNR_ZONES, r.voice_quality.hnr_db)?.name ?? null;
  const jitterZone = zoneOf(JITTER_ZONES, r.voice_quality.jitter_pct)?.name ?? null;
  const weightZone = zoneOf(WEIGHT_ZONES, r.weight?.h1a3c_db)?.name ?? null;

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

export async function generateFromGemini(
  r: Recording,
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
