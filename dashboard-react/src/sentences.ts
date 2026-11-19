// Sentence packs: the .txt files in the repo's sentences/ folder, one sentence
// per line, read aloud as practice material. Deliberately DOM-free and
// glob-free so scripts/test_sentence_packs.ts can check the ordering rule with
// plain node (the component does the import.meta.glob side).

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

/** Dropdown order: files whose name starts with a capital letter first, then
 *  the rest grouped by their _XX tag, so every file sharing an ending sits
 *  next to the others. Within a group, alphabetical. */
export function orderPacks(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
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
