import { net, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getAudioDir, getAnalysisDir, getRecordingsJsonPath, getRendererDistDir } from "./paths";

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
    pathname.startsWith("audio/") ||
    pathname.startsWith("analysis/")
  );
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
