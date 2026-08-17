import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import { registerAppProtocolScheme, registerAppProtocolHandler } from "./protocol";
import { registerIpcHandlers } from "./ipcHandlers";
import { getIconPath, migrateUserDataIfNeeded } from "./paths";
import { checkForUpdates } from "./updater";
import { chromeFor, readCachedTheme } from "./theme";

// FIRST, before anything reads userData — the theme cache, the updater and
// Chromium's session store all live under it. See paths.ts for why this exists.
migrateUserDataIfNeeded();

registerAppProtocolScheme();

function createWindow(): BrowserWindow {
  const chrome = chromeFor(readCachedTheme());
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    icon: getIconPath(),
    backgroundColor: chrome.bg,
    // Hide the native title bar but keep the min/max/close buttons, themed to
    // match the app (--titlebar-bg / --titlebar-ink from index.css) — the
    // dashboard renders its own draggable title row (TitleBar.tsx) at the
    // same height so the two form one seamless themed bar instead of a
    // mismatched default Windows titlebar sitting above a pink app.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: chrome.titlebar,
      symbolColor: chrome.symbol,
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL("app://dashboard/index.html");

  // Any window.open()/target="_blank" (e.g. the onboarding modal's Google AI
  // Studio link) must go to the OS browser, never a new BrowserWindow — a new
  // BrowserWindow would inherit this preload script and expose window.euphonia
  // to whatever remote origin it navigated to.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerAppProtocolHandler();
  const win = createWindow();
  registerIpcHandlers(win);
  checkForUpdates(win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
