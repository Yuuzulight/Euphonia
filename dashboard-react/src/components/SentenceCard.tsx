import { useEffect, useMemo, useRef, useState } from "react";
import {
  orderPacks,
  parsePack,
  randomSentence,
  type SentencePack,
} from "../sentences";

// The sentence prompt next to the record button: one random line from the
// chosen pack of practice sentences.
//
// The packs come from the repo's own sentences/ folder, injected at build time
// by sentencePacksPlugin.mjs as `virtual:sentences`. See the comment there for
// why that isn't a fetch from public/ or an import.meta.glob. Adding a pack
// shows up on reload in dev; a packaged build needs a rebuild.
import FILES from "virtual:sentences";

// Bumping this key is a reset for every existing user, so don't.
const STORAGE_KEY = "euphonia:sentence-pack";

function packIdOf(path: string): string {
  return path.split("/").pop()!.replace(/\.txt$/i, "");
}

function loadPackId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private-mode browsers can refuse reads
  }
}

export function SentenceCard() {
  const packs = useMemo<SentencePack[]>(() => {
    const raw = new Map<string, string>();
    for (const [path, text] of Object.entries(FILES)) raw.set(packIdOf(path), text);
    return orderPacks([...raw.keys()]).map((id) => parsePack(id, raw.get(id)!));
  }, []);

  const [packId, setPackId] = useState<string | null>(() => {
    const saved = loadPackId();
    return saved && packs.some((p) => p.id === saved) ? saved : packs[0]?.id ?? null;
  });
  const pack = packs.find((p) => p.id === packId) ?? packs[0] ?? null;
  const [sentence, setSentence] = useState(() => (pack ? randomSentence(pack) : ""));
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // A different pack gets a sentence of its own straight away.
  useEffect(() => {
    if (pack) setSentence(randomSentence(pack));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  // Close the list on a click outside it, or Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!pack) return null; // no sentences/ files to read from

  function choose(id: string) {
    setPackId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // not remembered, but it still applies for this session
    }
    setOpen(false);
  }

  return (
    <div className="sentence-card" ref={boxRef}>
      <div className="sentence-head">
        <span className="sentence-hint">💬 try reading this aloud</span>
        <span className="sentence-actions">
          <button
            className="sentence-pick"
            aria-haspopup="listbox"
            aria-expanded={open}
            title="Choose a sentence pack"
            onClick={() => setOpen((o) => !o)}
          >
            {pack.id}
            <span aria-hidden="true"> ▾</span>
          </button>
          <button
            className="sentence-next"
            aria-label="Another sentence"
            title="Another sentence"
            onClick={() => setSentence(randomSentence(pack, sentence))}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M19 12a7 7 0 1 1-2.1-5"
                stroke="currentColor"
                strokeWidth="2.2"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M19 3.5V7h-3.5"
                stroke="currentColor"
                strokeWidth="2.2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      </div>

      {open && (
        <ul className="sentence-menu" role="listbox" aria-label="sentence packs">
          {packs.map((p) => (
            <li key={p.id}>
              <button
                role="option"
                aria-selected={p.id === pack.id}
                className={p.id === pack.id ? "is-on" : ""}
                onClick={() => choose(p.id)}
              >
                {p.id}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="sentence-text" aria-live="polite">
        {sentence}
      </p>
    </div>
  );
}
