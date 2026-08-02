import { useState } from "react";

const GUIDE_STEPS = [
  ["Go to Google AI Studio", "aistudio.google.com/apikey"],
  ["Sign in with a Google account", ""],
  ["Click \"Create API key\"", ""],
  ["Copy the key and paste it below", ""],
] as const;

export function OnboardingModal({
  open,
  onClose,
  onAllDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onAllDeleted: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!open) return null;

  async function save() {
    if (!key.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await window.euphonia.settings.setKey(key.trim());
      setSaving(false);
      onClose();
    } catch (err) {
      setSaving(false);
      setError(
        err instanceof Error
          ? err.message
          : "couldn't save key — check that encryption is available"
      );
    }
  }

  async function exportBackup() {
    setExporting(true);
    setExportError(null);
    setExportPath(null);
    try {
      const result = await window.euphonia.exportRecordings();
      setExporting(false);
      if (!result.canceled && result.path) setExportPath(result.path);
    } catch (err) {
      setExporting(false);
      setExportError(
        err instanceof Error ? err.message : "couldn't export recordings"
      );
    }
  }

  async function deleteAll() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await window.euphonia.deleteAllRecordings();
      setDeleting(false);
      setDeleteConfirming(false);
      onAllDeleted();
    } catch (err) {
      setDeleting(false);
      setDeleteError(
        err instanceof Error ? err.message : "couldn't delete recordings"
      );
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal onboarding">
        <h2>💗 Gemini key (optional)</h2>
        <p>
          Euphonia already writes a short insight for every take — no setup needed.
          Add a free Gemini key for a richer, more personalized version instead:
        </p>
        <ol>
          {GUIDE_STEPS.map(([step, link], i) => (
            <li key={i}>
              {step}
              {link && (
                <>
                  {" — "}
                  <a href={`https://${link}`} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
        <input
          type="password"
          placeholder="paste your API key here"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={saving}
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>close</button>
          <button onClick={save} disabled={saving || !key.trim()}>
            {saving ? "saving…" : "save key"}
          </button>
        </div>

        <div className="backup-zone">
          <p className="danger-zone-label">back up</p>
          <button className="backup-btn" onClick={exportBackup} disabled={exporting}>
            {exporting ? "saving…" : "💾 export all recordings"}
          </button>
          {exportPath && <p className="backup-success">saved to {exportPath}</p>}
          {exportError && <p className="modal-error">{exportError}</p>}
        </div>

        <div className="danger-zone">
          <p className="danger-zone-label">danger zone</p>
          {!deleteConfirming ? (
            <button className="danger-btn" onClick={() => setDeleteConfirming(true)}>
              🗑️ delete all recordings
            </button>
          ) : (
            <div className="danger-confirm">
              <span>delete every recording? this can't be undone — export a backup above first if you want to keep them.</span>
              <button className="rec-confirm-yes" onClick={deleteAll} disabled={deleting}>
                {deleting ? "deleting…" : "yes, delete everything"}
              </button>
              <button
                className="rec-confirm-no"
                onClick={() => setDeleteConfirming(false)}
                disabled={deleting}
              >
                cancel
              </button>
            </div>
          )}
          {deleteError && <p className="modal-error">{deleteError}</p>}
        </div>
      </div>
    </div>
  );
}
