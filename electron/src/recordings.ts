import fs from "node:fs";
import path from "node:path";
import { dialog, BrowserWindow } from "electron";
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

// Copies recordings.json + audio/ + analysis/ into a timestamped folder
// wherever the user picks — a plain folder, not a zip, so this needs no new
// dependency. Meant as the "back up before you delete" escape hatch.
export async function exportRecordings(
  win: BrowserWindow | null,
): Promise<{ canceled: boolean; path?: string }> {
  const options: Electron.OpenDialogOptions = {
    title: "Choose a folder to save your backup",
    properties: ["openDirectory", "createDirectory"],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destRoot = path.join(result.filePaths[0], `euphonia-backup-${stamp}`);
  fs.mkdirSync(destRoot, { recursive: true });

  const recordingsJson = getRecordingsJsonPath();
  if (fs.existsSync(recordingsJson)) {
    fs.copyFileSync(recordingsJson, path.join(destRoot, "recordings.json"));
  }
  if (fs.existsSync(getAudioDir())) {
    fs.cpSync(getAudioDir(), path.join(destRoot, "audio"), { recursive: true });
  }
  if (fs.existsSync(getAnalysisDir())) {
    fs.cpSync(getAnalysisDir(), path.join(destRoot, "analysis"), { recursive: true });
  }

  return { canceled: false, path: destRoot };
}
