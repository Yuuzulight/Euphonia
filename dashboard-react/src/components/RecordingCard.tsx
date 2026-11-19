import { useRef, useState } from "react";
import type { Recording } from "../types";
import { fmt } from "../zones";
import { WaveformPlayer } from "./WaveformPlayer";

export function RecordingCard({
  r,
  onDelete,
  onRename,
}: {
  r: Recording;
  onDelete?: () => void;
  /** Called with the new name when the user renames this take. */
  onRename?: (label: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<string | null>(null); // null = not renaming
  // Esc must not also fire the blur-save that follows it
  const skipBlur = useRef(false);

  function save() {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const next = (draft ?? "").trim();
    setDraft(null);
    // blank or unchanged: keep the name it already had
    if (next && next !== r.label) onRename?.(next);
  }

  function cancel() {
    skipBlur.current = true;
    setDraft(null);
  }

  return (
    <div className="rec">
      <div className="top">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="num">{r.id}</span>
          {draft === null ? (
            <span className="label-txt">{r.label}</span>
          ) : (
            <input
              className="rec-rename"
              autoFocus
              value={draft}
              aria-label={`rename take ${r.id}`}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              onBlur={save}
            />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="date">
            {r.date} · {fmt(r.duration_s, "s")}
          </span>
          {onRename && draft === null && (
            <button
              className="rec-rename-btn"
              title="rename this take"
              onClick={(e) => {
                e.stopPropagation();
                skipBlur.current = false;
                setDraft(r.label);
              }}
            >
              ✏️
            </button>
          )}
          {onDelete && !confirming && (
            <button
              className="rec-delete"
              title="delete this take"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      {confirming && (
        <div className="rec-confirm">
          <span>
            delete take #{r.id}? this can't be undone
            {r.audio ? " — you can download the audio below first if you want to keep it." : "."}
          </span>
          <button
            className="rec-confirm-yes"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
          >
            yes, delete
          </button>
          <button
            className="rec-confirm-no"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
          >
            cancel
          </button>
        </div>
      )}
      <div className="metrics">
        <div className="chip">
          <b>{fmt(r.pitch.mean_hz)}</b>
          <span>pitch Hz</span>
        </div>
        <div className="chip">
          <b>
            {fmt(r.pitch.min_hz)}–{fmt(r.pitch.max_hz)}
          </b>
          <span>range Hz</span>
        </div>
        <div className="chip">
          <b>{fmt(r.formants.f2_hz)}</b>
          <span>F2 Hz</span>
        </div>
        <div className="chip">
          <b>{fmt(r.intensity.mean_db)}</b>
          <span>loud dB</span>
        </div>
        <div className="chip">
          <b>{fmt(r.pitch.sd_hz)}</b>
          <span>variab Hz</span>
        </div>
        <div className="chip">
          <b>{fmt(r.voice_quality.hnr_db)}</b>
          <span>HNR dB</span>
        </div>
      </div>
      {r.note && <div className="note">📝 {r.note}</div>}
      {r.audio && (
        <WaveformPlayer
          src={r.audio}
          duration={r.duration_s}
          downloadName={`voice-take-${r.id}`}
        />
      )}
    </div>
  );
}
