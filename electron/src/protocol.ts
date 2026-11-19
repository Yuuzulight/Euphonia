import { net, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getAudioDir,
  getAnalysisDir,
  getBundledSentencesJson,
  getRecordingsJsonPath,
  getRendererDistDir,
  getSentencesDir,
} from "./paths";

export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function isDynamicPath(pathname: string): boolean {
  return (
    pathname === "recordings.json" ||
    pathname === "sentences/index.json" ||
    pathname.startsWith("audio/") ||
    pathname.startsWith("analysis/")
  );
}

// The practice sentences as { "<pack id>": "<file text>" }, the same shape the
// dev server serves (see dashboard-react/sentencePacksPlugin.mjs). Read from the
// folder on every request, so a .txt dropped in shows up on the next load with
// no rebuild; the copy bundled into the dashboard is the fallback for an install
// whose folder doesn't exist yet.
function readSentencePacks(): string {
  const dir = getSentencesDir();
  try {
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt"));
    if (files.length > 0) {
      const out: Record<string, string> = {};
      for (const file of files.sort()) {
        out[file.replace(/\.txt$/i, "")] = fs.readFileSync(path.join(dir, file), "utf8");
      }
      return JSON.stringify(out);
    }
  } catch {
    // no folder of their own: fall through to the bundled snapshot
  }
  try {
    return fs.readFileSync(getBundledSentencesJson(), "utf8");
  } catch {
    return "{}"; // nothing anywhere: the sentence card just doesn't render
  }
}

// Verify that a resolved path stays within its base directory.
// Protects against path traversal via percent-encoded slashes in URLs.
function resolveWithinBase(baseDir: string, relativePath: string): string | null {
  const resolved = path.resolve(baseDir, relativePath);
  const normalizedBase = path.resolve(baseDir) + path.sep;
  if (resolved !== path.resolve(baseDir) && !resolved.startsWith(normalizedBase)) {
    return null; // escapes the base directory — reject
  }
  return resolved;
}

export function registerAppProtocolHandler(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    // app://dashboard/<pathname>
    let pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (pathname === "") pathname = "index.html";

    if (isDynamicPath(pathname)) {
      if (pathname === "recordings.json") {
        const filePath = getRecordingsJsonPath();
        if (!fs.existsSync(filePath)) {
          return new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return net.fetch(pathToFileURL(filePath).toString());
      } else if (pathname === "sentences/index.json") {
        return new Response(readSentencePacks(), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } else if (pathname.startsWith("audio/")) {
        const relative = pathname.slice("audio/".length);
        const filePath = resolveWithinBase(getAudioDir(), relative);
        if (!filePath) {
          return new Response("Forbidden", { status: 403 });
        }
        if (!fs.existsSync(filePath)) {
          return new Response("Not found", { status: 404 });
        }
        return net.fetch(pathToFileURL(filePath).toString());
      } else if (pathname.startsWith("analysis/")) {
        const relative = pathname.slice("analysis/".length);
        const filePath = resolveWithinBase(getAnalysisDir(), relative);
        if (!filePath) {
          return new Response("Forbidden", { status: 403 });
        }
        if (!fs.existsSync(filePath)) {
          return new Response("Not found", { status: 404 });
        }
        return net.fetch(pathToFileURL(filePath).toString());
      }
    }

    // Static bundle asset (JS/CSS/HTML/reference.json/reference-audio/favicons).
    const filePath = resolveWithinBase(getRendererDistDir(), pathname);
    if (!filePath) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
