import { useEffect, useState } from "react";
import type { UpdateStatus } from "../vg-bridge";

// A quiet toast for auto-update progress. Failed checks never reach here
// (updater.ts only logs them) — the app works fine on the version it
// already has, so a failed background check isn't the user's problem.
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => window.euphonia.updates.onStatus(setStatus), []);

  if (!status || status.state === "checking" || status.state === "not-available") {
    return null;
  }

  return (
    <div className="update-banner">
      {status.state === "available" && (
        <span>✨ Euphonia {status.version} is downloading in the background…</span>
      )}
      {status.state === "downloading" && (
        <span>✨ downloading update… {status.percent}%</span>
      )}
      {status.state === "downloaded" && (
        <>
          <span>✨ Euphonia {status.version} is ready.</span>
          <button
            onClick={() => {
              setInstalling(true);
              window.euphonia.updates.install();
            }}
            disabled={installing}
          >
            {installing ? "restarting…" : "restart to update"}
          </button>
        </>
      )}
    </div>
  );
}
