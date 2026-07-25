import { app } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { getUserDataRoot } from "./paths";

export interface AnalyzeInput {
  audioTempPath: string;
  label: string;
  note?: string;
}

function getFfmpegBinPath(): string | null {
  if (!app.isPackaged) return null; // rely on ffmpeg already on PATH in dev
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(process.resourcesPath, "ffmpeg", `ffmpeg${ext}`);
}

function getSidecarCommand(): { cmd: string; args: string[]; cwd: string } {
  const repoRoot = path.resolve(__dirname, "..", "..");
  if (!app.isPackaged) {
    return { cmd: "uv", args: ["run", "analyze.py"], cwd: repoRoot };
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  const exe = path.join(process.resourcesPath, "sidecar", `analyze${ext}`);
  return { cmd: exe, args: [], cwd: process.resourcesPath };
}

export function runAnalyze(input: AnalyzeInput): Promise<void> {
  const { cmd, args, cwd } = getSidecarCommand();
  const fullArgs = [
    ...args,
    input.audioTempPath,
    "--label",
    input.label,
    "--output-root",
    getUserDataRoot(),
  ];
  if (input.note) fullArgs.push("--note", input.note);

  const ffmpegBin = getFfmpegBinPath();
  const env = { ...process.env, ...(ffmpegBin ? { FFMPEG_BIN: ffmpegBin } : {}) };

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, fullArgs, { cwd, env });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`analyze.py exited ${code}: ${stderr}`));
    });
  });
}
