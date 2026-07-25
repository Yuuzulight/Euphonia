import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("voiceGarden", {
  createRecording: (payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }) => ipcRenderer.invoke("recordings:create", payload),
});
