// Sentence packs: the .txt files in the repo's sentences/ folder, one sentence
// per line, read aloud as practice material. The folder is read at runtime
// (sentencesSource.ts) and this module decides which files qualify and in what
// order. Deliberately DOM-free so scripts/test_sentence_packs.ts can check the
// rules with plain node.

export interface SentencePack {
  /** filename without its extension, e.g. "casual_EN", also the dropdown label */
  id: string;
  /** the trailing _XX language tag, or "" when the file has none */
  suffix: string;
  sentences: string[];
}

/** The "_XX" tag a pack name ends with (two capitals after an underscore), or
 *  "" when it has none. Only the *ending* counts: "formal_PL_v2" has no tag. */
export function packSuffix(id: string): string {
  const m = /_([A-Z]{2})$/.exec(id);
  return m ? m[1] : "";
}

/** Only files that follow the naming convention are offered: a name starting
 *  with a capital letter, or one ending in an _XX tag. A file that does
 *  neither is skipped, so a stray notes.txt or draft-v2.txt never shows up. */
export function isPack(id: string): boolean {
  return /^[A-Z]/.test(id) || packSuffix(id) !== "";
}

/** The packs to list, in dropdown order: names starting with a capital letter
 *  first, then the rest grouped by their _XX tag so every file sharing an
 *  ending sits next to the others. Within a group, alphabetical. Files that
 *  follow neither convention are left out. */
export function listPacks(ids: string[]): string[] {
  return ids.filter(isPack).sort((a, b) => {
    const capitalFirst = Number(!/^[A-Z]/.test(a)) - Number(!/^[A-Z]/.test(b));
    if (capitalFirst) return capitalFirst;
    const sa = packSuffix(a);
    const sb = packSuffix(b);
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** One pack from its raw file text. Blank lines and stray whitespace are
 *  dropped, so a trailing newline never becomes an empty sentence. */
export function parsePack(id: string, raw: string): SentencePack {
  const sentences = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { id, suffix: packSuffix(id), sentences };
}

/** A random sentence from the pack, avoiding an immediate repeat where the pack
 *  has anything else to offer. */
export function randomSentence(pack: SentencePack, avoid?: string): string {
  const { sentences } = pack;
  if (sentences.length === 0) return "";
  const pool = sentences.filter((s) => s !== avoid);
  const from = pool.length ? pool : sentences;
  return from[Math.floor(Math.random() * from.length)];
}
