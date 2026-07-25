import { app, BrowserWindow } from "electron";
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
