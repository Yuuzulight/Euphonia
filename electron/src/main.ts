import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { registerAppProtocolScheme, registerAppProtocolHandler } from "./protocol";
import { registerIpcHandlers } from "./ipcHandlers";

registerAppProtocolScheme();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
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
