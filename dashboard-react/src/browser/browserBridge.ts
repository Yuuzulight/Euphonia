// Browser-mode implementation of the SAME EuphoniaBridge interface the
// Electron preload script exposes (vg-bridge.ts) -- so every existing
// component (RecordButton, GeneratedInsight, RecordingCard, OnboardingModal)
// works completely unmodified. Recording -> analysis goes through the WASM
// Praat engine (../wasm/) instead of spawning a sidecar process; storage
// goes through IndexedDB (./db.ts) instead of the OS filesystem.
//
// Known gaps vs. the desktop app (by design, for this feasibility slice):
// register/phrasing analysis isn't ported (analyze_register in analyze.py),
// so those fields are simply absent; the Gemini key lives in localStorage,
// not OS-encrypted storage; auto-update doesn't apply to a web deploy.

import type { EuphoniaBridge } from "../vg-bridge";
import type { Recording } from "../types";
import { analyzeWav } from "../wasm/pyodideEngine";
import { blobToMonoWav } from "../wasm/wavEncode";
import { generateTemplateInsight } from "./templateInsight";
import { generateFromGemini, getApiKey, setApiKey, clearApiKey } from "./gemini";
import * as db from "./db";

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Recording metadata + a fresh (this-session-only) object URL for playback. */
export async function loadRecordingsWithAudio(): Promise<Recording[]> {
  const rows = await db.getAllRecordings();
  return Promise.all(
    rows.map(async (r) => ({ ...r, audio: await db.getAudioObjectUrl(r.id) })),
  );
}

export const browserBridge: EuphoniaBridge = {
  async createRecording({ audioBase64, mimeType, label, note }) {
    const blob = base64ToBlob(audioBase64, mimeType);
    const wav = await blobToMonoWav(blob);
    const metrics = await analyzeWav(wav);
    const id = await db.nextRecordingId();
    const rec: Recording = {
      id,
      label,
      note: note ?? "",
      date: new Date().toISOString().slice(0, 10),
      source_file: `browser-recording-${id}${mimeType.includes("webm") ? ".webm" : ".audio"}`,
      audio: null, // resolved per-session by loadRecordingsWithAudio()
      duration_s: metrics.duration_s,
      pitch: metrics.pitch,
      formants: metrics.formants,
      voice_quality: metrics.voice_quality,
      intensity: metrics.intensity,
      weight: metrics.weight,
      // register/phrasing analysis isn't ported for this prototype slice.
    };
    await db.putRecording(rec);
    await db.putAudioBlob(id, blob, mimeType);
  },

  async deleteRecording(id) {
    await db.deleteRecordingRow(id);
  },

  async deleteAllRecordings() {
    await db.clearAll();
  },

  async exportRecordings() {
    const rows = await db.getAllRecordings();
    const json = JSON.stringify(rows, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `euphonia-backup-${stamp}.json`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    // Metrics only, by design -- grab individual takes' audio via each
    // recording card's own download button.
    return { canceled: false, path: `Downloads/${filename}` };
  },

  settings: {
    async getStatus() {
      return { hasKey: !!getApiKey() };
    },
    async setKey(key) {
      setApiKey(key);
    },
    async clearKey() {
      clearApiKey();
    },
  },

  insights: {
    async get(recordingId) {
      return db.getInsight(recordingId);
    },
    async generate(recording) {
      if (getApiKey()) {
        try {
          const result = await generateFromGemini(recording);
          const insight = { ...result, generated_at: new Date().toISOString(), source: "gemini" as const };
          await db.putInsight(recording.id, insight);
          return insight;
        } catch (err) {
          console.error("Gemini insight generation failed, falling back to template:", err);
        }
      }
      const result = generateTemplateInsight(recording);
      const insight = { ...result, generated_at: new Date().toISOString(), source: "template" as const };
      await db.putInsight(recording.id, insight);
      return insight;
    },
    async regenerateWithGemini(recording) {
      const result = await generateFromGemini(recording);
      const insight = { ...result, generated_at: new Date().toISOString(), source: "gemini" as const };
      await db.putInsight(recording.id, insight);
      return insight;
    },
  },

  updates: {
    // No installable-app concept in a web deploy.
    onStatus() {
      return () => {};
    },
    async install() {},
  },
};
