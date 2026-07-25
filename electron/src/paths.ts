import { app } from "electron";
import path from "node:path";

export function getUserDataRoot(): string {
  return app.getPath("userData");
}

export function getAudioDir(): string {
  return path.join(getUserDataRoot(), "audio");
}

export function getAnalysisDir(): string {
  return path.join(getUserDataRoot(), "analysis");
}

export function getRecordingsJsonPath(): string {
  return path.join(getUserDataRoot(), "recordings.json");
}

// The built dashboard-react static bundle. In dev, dashboard-react/dist
// sits two levels above electron/dist/. When packaged, electron-builder
// copies it to process.resourcesPath/dashboard (see Task 10).
export function getRendererDistDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "dashboard");
  }
  return path.join(__dirname, "..", "..", "dashboard-react", "dist");
}
