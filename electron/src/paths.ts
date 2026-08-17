import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

// Up to 0.5.0 the app had no productName, so Electron named it after the
// package — "euphonia-electron" — and derived userData from that. Adding
// productName fixes the install folder and the display name, but it also moves
// userData, which to an existing user looks exactly like every recording they
// have vanishing.
//
// migrateUserDataIfNeeded() moves the old directory across on the first launch
// after that upgrade. It has to run before ANYTHING reads userData — the theme
// cache, the updater, Chromium's own session store — so main.ts calls it as its
// very first statement.
//
// **Keep this.** It is the only thing standing between an upgrade from 0.4.0 or
// earlier and an apparently empty app, however far in the future that upgrade
// happens.
const LEGACY_DIR_NAME = "euphonia-electron";

// The user's own data. Chromium's caches are deliberately not here — they are
// disposable, and merging two of them risks corrupting both.
const OWNED_ENTRIES = [
  "recordings.json",
  "audio",
  "analysis",
  "gemini-key.enc",
  "theme.json",
];

// Not the user's data as such, but it holds the theme preference, so carrying it
// across means the upgrade doesn't silently reset how the app looks. Best-effort
// only: never let this decide whether the migration as a whole succeeded.
const LOCAL_STORAGE_DIR = "Local Storage";

function hasOwnedData(dir: string): boolean {
  return OWNED_ENTRIES.some((name) => fs.existsSync(path.join(dir, name)));
}

export function migrateUserDataIfNeeded(): void {
  const newRoot = app.getPath("userData");
  const oldRoot = path.join(path.dirname(newRoot), LEGACY_DIR_NAME);

  if (newRoot === oldRoot) return; // name unchanged; nothing to do
  if (!fs.existsSync(oldRoot)) return; // fresh install
  if (hasOwnedData(newRoot)) return; // already migrated — never clobber

  // Measured, not assumed: Electron creates userData before this module runs, so
  // newRoot almost always already exists and this is a per-entry move rather
  // than a directory rename. The rename path below is the rare one.
  let movedAny = false;
  try {
    if (!fs.existsSync(newRoot)) {
      fs.renameSync(oldRoot, newRoot);
      return;
    }
    for (const name of OWNED_ENTRIES) {
      const from = path.join(oldRoot, name);
      if (!fs.existsSync(from)) continue;
      fs.renameSync(from, path.join(newRoot, name));
      movedAny = true;
    }
  } catch {
    // Two folders on the same volume, so a rename should not fail — but if it
    // does (a locked file, a redirected AppData), only fall back while nothing
    // has moved yet. Once data is in the new location, sending the app back to
    // the old one would be the very thing this function exists to prevent.
    if (!movedAny) {
      app.setPath("userData", oldRoot);
      return;
    }
  }

  // Best-effort extras, each isolated so a failure leaves the move above intact.
  try {
    const lsFrom = path.join(oldRoot, LOCAL_STORAGE_DIR);
    const lsTo = path.join(newRoot, LOCAL_STORAGE_DIR);
    if (fs.existsSync(lsFrom) && !fs.existsSync(lsTo)) fs.renameSync(lsFrom, lsTo);
  } catch {
    // Theme preference resets to the default. Cosmetic; not worth failing over.
  }
  try {
    if (fs.readdirSync(oldRoot).length === 0) fs.rmdirSync(oldRoot);
  } catch {
    // An empty folder left behind is untidy, nothing more.
  }
}

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
