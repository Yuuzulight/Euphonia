// Vite plugin: expose the repo's sentences/ folder as the virtual module
// "virtual:sentences" (default export: { "<pack id>": "<file text>" }).
//
// The practice sentences live in sentences/ at the repo root, one sentence per
// line. That is outside Vite's project root, where import.meta.glob reaches
// nothing and says nothing about it. Bundled rather than fetched from public/,
// so the browser build, the desktop app and offline all behave identically. In
// dev, adding or removing a .txt reloads the page; a packaged build needs a
// rebuild to pick one up.
//
// Plain .mjs on purpose: this package has no @types/node, and vite.config.ts is
// type-checked by `tsc -b`, so the node imports live here rather than there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ID = "virtual:sentences";
const RESOLVED = "\0" + ID;
// "../sentences" relative to this file: dashboard-react/../sentences, the repo root.
const DIR = fileURLToPath(new URL("../sentences", import.meta.url));

export function sentencePacks() {
  const read = () => {
    const out = {};
    if (!fs.existsSync(DIR)) return out; // no folder yet: no packs, no card
    const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".txt"));
    for (const file of files.sort()) {
      out[file.replace(/\.txt$/i, "")] = fs.readFileSync(path.join(DIR, file), "utf8");
    }
    return out;
  };

  return {
    name: "euphonia:sentence-packs",
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load: (id) => (id === RESOLVED ? `export default ${JSON.stringify(read())}` : null),
    configureServer(server) {
      server.watcher.add(DIR);
      const reload = (file) => {
        if (path.resolve(file).startsWith(DIR)) server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", reload).on("unlink", reload).on("change", reload);
    },
  };
}
