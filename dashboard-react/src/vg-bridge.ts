import type { GeneratedInsight, Recording } from "./types";

export interface EuphoniaBridge {
  createRecording(payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }): Promise<void>;
  deleteRecording(id: number): Promise<void>;
  deleteAllRecordings(): Promise<void>;
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
