// Vite plugin: serve the repo's sentences/ folder to the app at runtime.
//
// The practice sentences live in sentences/ at the repo root, one sentence per
// line, and the app asks for them over HTTP as `sentences/index.json` (a
// { "<pack id>": "<file text>" } map). This plugin is the dev server's side of
// that: it answers the request straight from the folder, so dropping a .txt in
// and reloading is enough, no rebuild. It also emits the same JSON into the
// build output, which is what a static deploy (GitHub Pages) serves and what the
// packaged desktop app falls back to when the user has no folder of their own.
//
// Plain .mjs on purpose: this package has no @types/node, and vite.config.ts is
// type-checked by `tsc -b`, so the node imports live here rather than there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// "../sentences" relative to this file: dashboard-react/../sentences, the repo root.
const DIR = fileURLToPath(new URL("../sentences", import.meta.url));
const ROUTE = "/sentences/index.json";

/** The folder as a { pack id: file text } map. Shared shape with the desktop
 *  app's protocol handler, which reads its own folder the same way. */
export function readSentencePacks() {
  const out = {};
  if (!fs.existsSync(DIR)) return out; // no folder yet: no packs, no card
  const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".txt"));
  for (const file of files.sort()) {
    out[file.replace(/\.txt$/i, "")] = fs.readFileSync(path.join(DIR, file), "utf8");
  }
  return out;
}

export function sentencePacks() {
  return {
    name: "euphonia:sentence-packs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        if (url !== ROUTE && !url.startsWith(ROUTE + "?")) return next();
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(readSentencePacks()));
      });
      // A new or edited pack should show up without a manual reload.
      server.watcher.add(DIR);
      const reload = (file) => {
        if (path.resolve(file).startsWith(DIR)) server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", reload).on("unlink", reload).on("change", reload);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "sentences/index.json",
        source: JSON.stringify(readSentencePacks()),
      });
    },
  };
}
