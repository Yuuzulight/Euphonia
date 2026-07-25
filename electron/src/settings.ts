import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getUserDataRoot } from "./paths";

function getKeyFilePath(): string {
  return path.join(getUserDataRoot(), "gemini-key.enc");
}

export function getApiKey(): string | null {
  const file = getKeyFilePath();
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(file));
  } catch {
    return null;
  }
}

export function setApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-level encryption is not available on this machine.");
  }
  fs.mkdirSync(getUserDataRoot(), { recursive: true });
  fs.writeFileSync(getKeyFilePath(), safeStorage.encryptString(key));
}

export function clearApiKey(): void {
  const file = getKeyFilePath();
  if (fs.existsSync(file)) fs.rmSync(file);
}
