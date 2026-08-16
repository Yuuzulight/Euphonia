import { useTheme } from "../theme/ThemeProvider";
import {
  type ThemeId,
  DARK_THEMES,
  LIGHT_THEMES,
  THEME_NAMES,
} from "../theme/themes";
import type { ThemeMode } from "../theme/themeStore";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "light" },
  { id: "dark", label: "dark" },
  { id: "auto", label: "auto" },
];

// Picking a swatch only sets that family's favorite — it doesn't force the
// mode. It takes effect immediately when that family is the one showing
// (applyPref re-resolves) and silently otherwise, until the user flips to it.
function Swatches({
  ids,
  selected,
  onPick,
  legend,
  name,
}: {
  ids: ThemeId[];
  selected: ThemeId;
  onPick: (id: ThemeId) => void;
  legend: string;
  name: string;
}) {
  return (
    <fieldset className="theme-group">
      <legend>{legend}</legend>
      {ids.map((id) => (
        <label key={id} className={`theme-swatch${id === selected ? " is-on" : ""}`}>
          <input
            type="radio"
            name={name}
            checked={id === selected}
            onChange={() => onPick(id)}
          />
          {/* The chip previews a theme by being that theme — data-theme
              re-scopes the ordinary tokens onto this span, so no color
              values are duplicated here. It's decorative; the screen
              reader should announce the theme's name, not its swatch. */}
          <span className="theme-chip" data-theme={id} aria-hidden="true">
            <i />
          </span>
          {THEME_NAMES[id]}
        </label>
      ))}
    </fieldset>
  );
}

export function ThemePicker() {
  const { pref, setPref } = useTheme();
  return (
    <div className="theme-picker">
      <fieldset className="theme-group">
        <legend>appearance</legend>
        {MODES.map((m) => (
          <label key={m.id} className={`theme-mode${pref.mode === m.id ? " is-on" : ""}`}>
            <input
              type="radio"
              name="theme-mode"
              checked={pref.mode === m.id}
              onChange={() => setPref({ ...pref, mode: m.id })}
            />
            {m.label}
          </label>
        ))}
      </fieldset>
      <Swatches
        legend="light themes"
        name="theme-light"
        ids={LIGHT_THEMES}
        selected={pref.light}
        onPick={(id) => setPref({ ...pref, light: id })}
      />
      <Swatches
        legend="dark themes"
        name="theme-dark"
        ids={DARK_THEMES}
        selected={pref.dark}
        onPick={(id) => setPref({ ...pref, dark: id })}
      />
    </div>
  );
}
