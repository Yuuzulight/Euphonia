export interface VoiceGardenBridge {
  createRecording(payload: {
    audioBase64: string;
    mimeType: string;
    label: string;
    note?: string;
  }): Promise<void>;
  settings: {
    getStatus(): Promise<{ hasKey: boolean }>;
    setKey(key: string): Promise<void>;
    clearKey(): Promise<void>;
  };
}

declare global {
  interface Window {
    voiceGarden: VoiceGardenBridge;
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
