import { EuphoniaIcon } from "./icons";

// The in-page half of the desktop app's custom title bar — pairs with the
// native titleBarOverlay in electron/src/main.ts (same 40px height, both
// reading --titlebar-bg / --titlebar-ink for the active theme) so the
// OS-drawn window controls sit on what reads as one continuous themed bar
// instead of a default gray Windows titlebar.
export function TitleBar() {
  return (
    <div className="titlebar">
      <EuphoniaIcon size={16} title="Euphonia" />
      <span>Euphonia</span>
    </div>
  );
}
