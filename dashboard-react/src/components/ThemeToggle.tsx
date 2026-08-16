import { FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "../theme/ThemeProvider";
import { isDarkTheme } from "../theme/themes";

// Flips between the user's chosen light and dark favorites. It never cycles
// all eight — that's what the picker in Settings is for.
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const dark = isDarkTheme(resolved);
  const label = dark ? "switch to light theme" : "switch to dark theme";
  return (
    <button className="theme-toggle" onClick={toggle} title={label} aria-label={label}>
      {dark ? <FiSun /> : <FiMoon />}
    </button>
  );
}
