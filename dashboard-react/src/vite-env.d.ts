/// <reference types="vite/client" />

/** The repo's sentences/ folder, injected by sentencePacksPlugin.mjs:
 *  { "<pack id>": "<file text>" }, one sentence per line. */
declare module "virtual:sentences" {
  const packs: Record<string, string>;
  export default packs;
}
