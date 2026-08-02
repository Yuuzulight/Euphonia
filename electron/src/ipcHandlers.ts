import { ipcMain, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runAnalyze } from "./sidecar";
import { getApiKey, setApiKey, clearApiKey } from "./settings";
import type { RecordingSummary } from "./gemini";
import { generateInsight, regenerateWithGemini, readCachedInsight } from "./insights";
import { deleteRecording, deleteAllRecordings, exportRecordings } from "./recordings";
import { installUpdate } from "./updater";

interface CreateRecordingPayload {
  audioBase64: string;
  mimeType: string; // e.g. "audio/webm"
  label: string;
  note?: string;
}

function extFromMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("wav")) return ".wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return ".mp3";
  return ".m4a";
}

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle("recordings:create", async (_event, payload: CreateRecordingPayload) => {
    const tempPath = path.join(
      os.tmpdir(),
      `voicegarden-${randomUUID()}${extFromMimeType(payload.mimeType)}`,
    );
    fs.writeFileSync(tempPath, Buffer.from(payload.audioBase64, "base64"));
    try {
      await runAnalyze({ audioTempPath: tempPath, label: payload.label, note: payload.note });
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  });

  ipcMain.handle("recordings:delete", (_event, id: number) => deleteRecording(id));
  ipcMain.handle("recordings:deleteAll", () => deleteAllRecordings());
  ipcMain.handle("recordings:export", () => exportRecordings(win));

  ipcMain.handle("updates:install", () => installUpdate());

  ipcMain.handle("settings:getStatus", () => ({ hasKey: getApiKey() !== null }));
  ipcMain.handle("settings:setKey", (_event, key: string) => setApiKey(key));
  ipcMain.handle("settings:clearKey", () => clearApiKey());

  ipcMain.handle("insights:get", (_event, recordingId: number) => readCachedInsight(recordingId));
  ipcMain.handle("insights:generate", (_event, recording: RecordingSummary) =>
    generateInsight(recording),
  );
  ipcMain.handle("insights:regenerateWithGemini", (_event, recording: RecordingSummary) =>
    regenerateWithGemini(recording),
  );
}
