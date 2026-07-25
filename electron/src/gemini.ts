import fs from "node:fs";
import path from "node:path";
import { getAnalysisDir } from "./paths";
import { getApiKey } from "./settings";

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

export interface GeneratedInsight {
  summary: string;
  strengths: string[];
  focus_area: string;
  tip: string;
  generated_at: string;
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

function cachePath(recordingId: number): string {
  return path.join(getAnalysisDir(), `${recordingId}-insight.json`);
}

export function readCachedInsight(recordingId: number): GeneratedInsight | null {
  const file = cachePath(recordingId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    // Truncated/corrupt cache file (e.g. interrupted write) — treat like
    // "no cache yet" instead of throwing and wedging the renderer forever.
    return null;
  }
}

function buildPrompt(r: RecordingSummary): string {
  return `You are a warm, encouraging voice-feminization coach. Numbers are a
compass, not a judge — always pair any weakness with one concrete, doable
next step, and end warm. Never use the word "masculine" as a generic
put-down; it only applies literally to register crashes.

This take (#${r.id}, "${r.label}"):
- pitch mean: ${r.pitch.mean_hz ?? "n/a"} Hz
- resonance F2: ${r.formants.f2_hz ?? "n/a"} Hz
- clarity (HNR): ${r.voice_quality.hnr_db ?? "n/a"} dB
- steadiness (jitter): ${r.voice_quality.jitter_pct ?? "n/a"}%
- weight (spectral tilt): ${r.weight?.h1a3c_db ?? "n/a"} dB
- % time in register: ${r.register?.in_register_pct ?? "n/a"}%
- sub-register at phrase endings: ${r.register?.offset_sub_pct ?? "n/a"}%
- phrase endings landed in register: ${r.register?.phrases_landed_pct ?? "n/a"}%

Write a short summary (2-3 sentences), 2-3 genuine strengths, one clear
focus_area naming the single most clockable thing to work on, and one
concrete tip (a specific, doable exercise).`;
}

export async function generateInsight(r: RecordingSummary): Promise<GeneratedInsight> {
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
  const parsed = JSON.parse(text) as Omit<GeneratedInsight, "generated_at">;

  const insight: GeneratedInsight = { ...parsed, generated_at: new Date().toISOString() };
  fs.mkdirSync(getAnalysisDir(), { recursive: true });
  fs.writeFileSync(cachePath(r.id), JSON.stringify(insight, null, 2));
  return insight;
}
