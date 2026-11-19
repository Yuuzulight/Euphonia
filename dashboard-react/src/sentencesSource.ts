// Where the sentence packs come from at runtime.
//
// The app asks for `sentences/index.json`, a { "<pack id>": "<file text>" } map,
// and whichever host is serving answers it from a folder it can read live:
//
//   browser dev server   the Vite plugin reads the repo's sentences/ per request
//   desktop app          the app:// protocol handler reads the app's own folder
//   static build / Pages  the snapshot the plugin emits into the build output
//
// So adding or editing a .txt needs no rebuild: the next load (or the next time
// the window is focused) picks it up. Which files count, and their order, is
// listPacks() in ./sentences.ts.
import { listPacks, parsePack, type SentencePack } from "./sentences";

/** The packs to offer, already filtered and ordered. [] means the folder really
 *  is empty; null means the read failed (offline, or a host that didn't answer),
 *  which callers treat as "keep what you have" rather than "show nothing". */
export async function fetchPacks(): Promise<SentencePack[] | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}sentences/index.json?t=${Date.now()}`);
    if (!res.ok) return null;
    const files = (await res.json()) as Record<string, string>;
    return listPacks(Object.keys(files))
      .map((id) => parsePack(id, files[id]))
      .filter((p) => p.sentences.length > 0);
  } catch {
    return null;
  }
}
