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
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal onboarding">
        <h2>💗 welcome to Euphonia</h2>
        <p>add a free Gemini key to get written insights per take:</p>
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
          <button onClick={onClose}>skip for now</button>
          <button onClick={save} disabled={saving || !key.trim()}>
            {saving ? "saving…" : "save key"}
          </button>
        </div>
      </div>
    </div>
  );
}
