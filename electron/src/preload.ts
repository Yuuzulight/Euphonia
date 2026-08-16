import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("euphonia", {
  createRecording: (payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }) => ipcRenderer.invoke("recordings:create", payload),
  deleteRecording: (id: number) => ipcRenderer.invoke("recordings:delete", id),
  deleteAllRecordings: () => ipcRenderer.invoke("recordings:deleteAll"),
  exportRecordings: () => ipcRenderer.invoke("recordings:export"),
  settings: {
    getStatus: () => ipcRenderer.invoke("settings:getStatus"),
    setKey: (key: string) => ipcRenderer.invoke("settings:setKey", key),
    clearKey: () => ipcRenderer.invoke("settings:clearKey"),
  },
  insights: {
    get: (recordingId: number) => ipcRenderer.invoke("insights:get", recordingId),
    generate: (recording: unknown) => ipcRenderer.invoke("insights:generate", recording),
    regenerateWithGemini: (recording: unknown) =>
      ipcRenderer.invoke("insights:regenerateWithGemini", recording),
  },
  updates: {
    onStatus: (callback: (status: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
      ipcRenderer.on("updates:status", listener);
      return () => ipcRenderer.removeListener("updates:status", listener);
    },
    install: () => ipcRenderer.invoke("updates:install"),
  },
  setTheme: (id: string) => ipcRenderer.send("theme:set", id),
});
