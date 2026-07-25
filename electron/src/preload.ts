import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("euphonia", {
  createRecording: (payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }) => ipcRenderer.invoke("recordings:create", payload),
  settings: {
    getStatus: () => ipcRenderer.invoke("settings:getStatus"),
    setKey: (key: string) => ipcRenderer.invoke("settings:setKey", key),
    clearKey: () => ipcRenderer.invoke("settings:clearKey"),
  },
});
