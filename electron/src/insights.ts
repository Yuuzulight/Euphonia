import fs from "node:fs";
import path from "node:path";
import { getAnalysisDir } from "./paths";
import { getApiKey } from "./settings";
import { generateFromGemini, type RecordingSummary } from "./gemini";
import { generateTemplateInsight } from "./templateInsight";

export interface GeneratedInsight {
  summary: string;
  strengths: string[];
  focus_area: string;
  tip: string;
  generated_at: string;
  // "template": instant, zero-network, always available (see
  // templateInsight.ts). "gemini": richer, personalized, opt-in — only used
  // when the user has added their own API key.
  source: "template" | "gemini";
}

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

function writeCache(recordingId: number, insight: GeneratedInsight): void {
  fs.mkdirSync(getAnalysisDir(), { recursive: true });
  fs.writeFileSync(cachePath(recordingId), JSON.stringify(insight, null, 2));
}

/** The default insight path: Gemini if a key is set and the call succeeds,
 * template otherwise. Never throws — there is always a valid instant
 * fallback, since installation shouldn't require any setup to get a working
 * insight. Overwrites any existing cache (callers should check
 * readCachedInsight first if they only want a fresh generation on demand). */
export async function generateInsight(r: RecordingSummary): Promise<GeneratedInsight> {
  if (getApiKey()) {
    try {
      const result = await generateFromGemini(r);
      const insight: GeneratedInsight = {
        ...result,
        generated_at: new Date().toISOString(),
        source: "gemini",
      };
      writeCache(r.id, insight);
      return insight;
    } catch (err) {
      // A key that's present but failing (bad key, network hiccup, Gemini
      // outage, rate limit) shouldn't block the feature entirely — fall
      // back to the always-available template instead of surfacing an
      // error for something the user didn't have to opt into failing.
      console.error("Gemini insight generation failed, falling back to template:", err);
    }
  }

  const result = generateTemplateInsight(r);
  const insight: GeneratedInsight = {
    ...result,
    generated_at: new Date().toISOString(),
    source: "template",
  };
  writeCache(r.id, insight);
  return insight;
}

/** Explicit "upgrade to AI" path — always calls Gemini, never falls back.
 * Only meaningful (and only ever shown in the UI) when a key is present;
 * throws NO_API_KEY otherwise as a safety guard. */
export async function regenerateWithGemini(r: RecordingSummary): Promise<GeneratedInsight> {
  const result = await generateFromGemini(r);
  const insight: GeneratedInsight = {
    ...result,
    generated_at: new Date().toISOString(),
    source: "gemini",
  };
  writeCache(r.id, insight);
  return insight;
}
