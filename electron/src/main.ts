import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import { registerAppProtocolScheme, registerAppProtocolHandler } from "./protocol";
import { registerIpcHandlers } from "./ipcHandlers";
import { getIconPath } from "./paths";

registerAppProtocolScheme();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    icon: getIconPath(),
    // Hide the native title bar but keep the min/max/close buttons, themed to
    // match the app (--pink-soft / --ink from index.css) — the dashboard
    // renders its own draggable title row (TitleBar.tsx) at the same height
    // so the two form one seamless themed bar instead of a mismatched
    // default Windows titlebar sitting above a pink app.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffd9ea",
      symbolColor: "#6b5876",
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
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerAppProtocolHandler();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
