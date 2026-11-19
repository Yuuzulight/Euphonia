import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Plain-JS Vite plugin, kept out of this file because this package has no
// @types/node and `tsc -b` type-checks vite.config.ts.
// @ts-ignore
import { sentencePacks } from "./sentencePacksPlugin.mjs";

// base: './' so the production build can also be opened from the filesystem.
export default defineConfig({
  base: "./",
  plugins: [react(), sentencePacks()],
});
