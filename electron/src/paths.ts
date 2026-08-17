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

// The user's irreplaceable data, and the ONLY thing that decides whether a
// migration has already happened. Everything here is written by the user's own
// actions, never by the app starting up — which is the property that makes it
// safe to use as the sentinel.
const USER_DATA_ENTRIES = ["recordings.json", "audio", "analysis", "gemini-key.enc"];

// Moved when present, but deliberately NOT part of the sentinel. theme.json is a
// disposable cache the app rewrites on every theme change, and Local Storage is
// created by Chromium on first paint — so both can exist in the new directory
// after a single stray launch. Treating either as "migration already done" would
// permanently strand the user's recordings in the old folder, which is exactly
// the failure this whole function exists to prevent.
const EXTRA_ENTRIES = ["theme.json", "Local Storage"];

// An entry only counts as data if it actually holds something. An empty audio/
// or analysis/ directory is what a half-started profile leaves behind, and
// treating one as "the user's data is already here" would block the migration
// permanently — the same trap theme.json set, in a different disguise.
function hasUserData(dir: string): boolean {
  return USER_DATA_ENTRIES.some((name) => {
    const target = path.join(dir, name);
    try {
      const stat = fs.statSync(target);
      return stat.isDirectory() ? fs.readdirSync(target).length > 0 : stat.size > 0;
    } catch {
      return false; // absent, or unreadable — either way, not data we can claim
    }
  });
}

export function migrateUserDataIfNeeded(): void {
  const newRoot = app.getPath("userData");
  const oldRoot = path.join(path.dirname(newRoot), LEGACY_DIR_NAME);


  if (newRoot === oldRoot) return; // name unchanged; nothing to do
  if (!fs.existsSync(oldRoot)) return; // fresh install
  if (!hasUserData(oldRoot)) return; // nothing worth moving
  if (hasUserData(newRoot)) return; // already migrated — never clobber

  // Measured, not assumed: Electron creates userData before this module runs, so
  // newRoot almost always already exists and this is a per-entry move rather
  // than a directory rename. The rename path below is the rare one.
  let movedAny = false;
  try {
    if (!fs.existsSync(newRoot)) {
      fs.renameSync(oldRoot, newRoot);
      return;
    }
    for (const name of USER_DATA_ENTRIES) {
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

  // Best-effort extras, isolated so a failure leaves the move above intact. Only
  // taken when the destination is absent — a Local Storage the new profile has
  // already started writing is not ours to overwrite.
  for (const name of EXTRA_ENTRIES) {
    try {
      const from = path.join(oldRoot, name);
      const to = path.join(newRoot, name);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
    } catch {
      // At worst the theme resets to the default. Cosmetic; never worth failing.
    }
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
