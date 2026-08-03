// Side-effect module: if no Electron preload script has already set
// window.euphonia (i.e. we're in a plain browser tab, not the desktop app),
// install the WASM/IndexedDB-backed browserBridge in its place. Imported
// once at the app's entry point (main.tsx), before anything renders.

import { browserBridge } from "./browserBridge";

export const isBrowserMode = typeof window !== "undefined" && !window.euphonia;

if (isBrowserMode) {
  window.euphonia = browserBridge;
}
