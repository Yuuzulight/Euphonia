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

export function registerAppProtocolHandler(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    // app://dashboard/<pathname>
    let pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (pathname === "") pathname = "index.html";

    if (isDynamicPath(pathname)) {
      const filePath =
        pathname === "recordings.json"
          ? getRecordingsJsonPath()
          : pathname.startsWith("audio/")
            ? path.join(getAudioDir(), pathname.slice("audio/".length))
            : path.join(getAnalysisDir(), pathname.slice("analysis/".length));

      if (!fs.existsSync(filePath)) {
        if (pathname === "recordings.json") {
          return new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    }

    // Static bundle asset (JS/CSS/HTML/reference.json/reference-audio/favicons).
    const filePath = path.join(getRendererDistDir(), pathname);
    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
