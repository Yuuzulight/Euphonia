import fs from "node:fs";
import path from "node:path";
import { getUserDataRoot, getRecordingsJsonPath, getAudioDir, getAnalysisDir } from "./paths";

interface RecordingEntry {
  id: number;
  audio?: string | null;
  detail?: string;
  [key: string]: unknown;
}

function readRecordings(): RecordingEntry[] {
  const file = getRecordingsJsonPath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function writeRecordings(recordings: RecordingEntry[]): void {
  fs.writeFileSync(getRecordingsJsonPath(), JSON.stringify(recordings, null, 2));
}

// audio/detail are stored relative to the userData root (see analyze.py).
function deleteIfExists(relativePath: string | null | undefined): void {
  if (!relativePath) return;
  fs.rmSync(path.join(getUserDataRoot(), relativePath), { force: true });
}

export function deleteRecording(id: number): void {
  const recordings = readRecordings();
  const target = recordings.find((r) => r.id === id);
  if (!target) return;
  deleteIfExists(target.audio);
  deleteIfExists(target.detail);
  fs.rmSync(path.join(getAnalysisDir(), `${id}-insight.json`), { force: true });
  writeRecordings(recordings.filter((r) => r.id !== id));
}

export function deleteAllRecordings(): void {
  fs.rmSync(getAudioDir(), { recursive: true, force: true });
  fs.rmSync(getAnalysisDir(), { recursive: true, force: true });
  writeRecordings([]);
}
