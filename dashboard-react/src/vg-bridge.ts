import type { GeneratedInsight, Recording } from "./types";

// Mirrors electron/src/updater.ts's UpdateStatus — kept in sync manually
// (same pattern as zones.ts's intentional duplication) since the renderer
// can't import from electron/src directly.
export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string };

export interface EuphoniaBridge {
  createRecording(payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }): Promise<void>;
  deleteRecording(id: number): Promise<void>;
  deleteAllRecordings(): Promise<void>;
  exportRecordings(): Promise<{ canceled: boolean; path?: string }>;
  settings: {
    getStatus(): Promise<{ hasKey: boolean }>;
    setKey(key: string): Promise<void>;
    clearKey(): Promise<void>;
  };
  insights: {
    get(recordingId: number): Promise<GeneratedInsight | null>;
    generate(recording: Recording): Promise<GeneratedInsight>;
    regenerateWithGemini(recording: Recording): Promise<GeneratedInsight>;
  };
  updates: {
    onStatus(callback: (status: UpdateStatus) => void): () => void;
    install(): Promise<void>;
  };
  /** Desktop only — repaints the native title bar. Absent in browser mode,
      which is why it's optional and called with `?.`. Implemented in
      electron/src/preload.ts (see Task 10). */
  setTheme?: (id: string) => void;
}

declare global {
  interface Window {
    euphonia: EuphoniaBridge;
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1)); // strip data: URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
