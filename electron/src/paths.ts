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

// The window/taskbar icon. In dev this is electron/resources/icon.ico
// directly; when packaged, electron-builder also copies it to the resources
// root (see extraResources in electron-builder.yml) since a raw Electron.exe
// (dev) doesn't carry the icon the way the built Euphonia.exe does.
export function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.ico");
  }
  return path.join(__dirname, "..", "resources", "icon.ico");
}
