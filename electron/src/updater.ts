import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string };

let updateWindow: BrowserWindow | null = null;

function send(status: UpdateStatus): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send("updates:status", status);
  }
}

// Checks GitHub Releases for a newer version (the feed URL comes from
// app-update.yml, generated at build time from electron-builder.yml's
// `publish` config), downloads it in the background, and reports progress to
// the renderer (see UpdateBanner.tsx). Packaged builds only — a dev/unpacked
// build has no real update feed to check against.
export function checkForUpdates(win: BrowserWindow): void {
  if (!app.isPackaged) return;

  updateWindow = win;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => send({ state: "checking" }));
  autoUpdater.on("update-available", (info) => send({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send({ state: "not-available" }));
  autoUpdater.on("download-progress", (p) =>
    send({ state: "downloading", percent: Math.round(p.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) => send({ state: "downloaded", version: info.version }));
  // A failed check (offline, rate-limited, whatever) shouldn't be a user-facing
  // error — the app works fine on the version it already has. Log only.
  autoUpdater.on("error", (err) => console.error("Auto-update check failed:", err));

  autoUpdater.checkForUpdates().catch((err) => console.error("Auto-update check failed:", err));
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
