import { useEffect, useMemo, useRef, useState } from "react";
import { randomSentence, type SentencePack } from "../sentences";
import { fetchPacks } from "../sentencesSource";

// The sentence prompt next to the record button: one random line from the
// chosen pack of practice sentences.
//
// The packs are read at runtime (see sentencesSource.ts), so dropping a .txt
// into the sentences/ folder shows up on the next load, or the next time this
// window is focused, with no rebuild. Which files are offered, and in what
// order, is listPacks() in ../sentences.ts.

// Bumping this key is a reset for every existing user, so don't.
const STORAGE_KEY = "euphonia:sentence-pack";

function loadPackId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private-mode browsers can refuse reads
  }
}

export function SentenceCard({ takeCount }: { takeCount: number }) {
  const [packs, setPacks] = useState<SentencePack[] | null>(null);
  const [packId, setPackId] = useState<string | null>(loadPackId);
  const [sentence, setSentence] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Read the folder now, and again whenever the window comes back into focus:
  // that is how a pack added while the app was open shows up.
  useEffect(() => {
    let live = true;
    const load = () => {
      fetchPacks().then((next) => {
        if (live && next) setPacks(next); // null = the read failed, keep what we have
      });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  const pack = useMemo(() => {
    if (!packs || packs.length === 0) return null;
    return packs.find((p) => p.id === packId) ?? packs[0];
  }, [packs, packId]);

  // A pack that has just arrived, or a different one: show one of its lines,
  // unless the line already on screen is still part of it.
  useEffect(() => {
    if (!pack) return;
    setSentence((prev) => (prev && pack.sentences.includes(prev) ? prev : randomSentence(pack)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack?.id, packs]);

  // A finished take moves on to the next sentence, from the same pack.
  useEffect(() => {
    if (takeCount === 0 || !pack) return;
    setSentence((prev) => randomSentence(pack, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeCount]);

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

  if (!pack || !packs) return null; // still loading, or nothing usable in the folder

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
            onClick={() => setSentence((prev) => randomSentence(pack, prev))}
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
