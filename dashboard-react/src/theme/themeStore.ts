import { type ThemeId, LIGHT_THEMES, DARK_THEMES } from "./themes";

export type ThemeMode = "light" | "dark" | "auto";

export interface ThemePref {
  mode: ThemeMode;
  light: ThemeId;
  dark: ThemeId;
}

// Bumping this key is a reset for every existing user — don't.
export const STORAGE_KEY = "euphonia:theme";

// Fired on <window> after the theme changes, so the color hook can re-read the
// computed tokens. CustomEvent detail is the resolved ThemeId.
export const THEME_CHANGE_EVENT = "euphonia:themechange";

// Defaults chosen so an existing user on a light-themed OS sees no change.
export const DEFAULT_PREF: ThemePref = {
  mode: "auto",
  light: "blossom",
  dark: "dusk-plum",
};

export function loadPref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREF;
    const parsed = JSON.parse(raw) as Partial<ThemePref>;
    return {
      mode:
        parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "auto"
          ? parsed.mode
          : DEFAULT_PREF.mode,
      light:
        parsed.light && LIGHT_THEMES.includes(parsed.light)
          ? parsed.light
          : DEFAULT_PREF.light,
      dark:
        parsed.dark && DARK_THEMES.includes(parsed.dark)
          ? parsed.dark
          : DEFAULT_PREF.dark,
    };
  } catch {
    // corrupt or unavailable storage is not worth crashing the app over
    return DEFAULT_PREF;
  }
}

export function savePref(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // private-mode browsers can refuse writes; the theme still applies for
    // this session, it just won't be remembered.
  }
}

export function systemPrefersDark(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolvePref(pref: ThemePref): ThemeId {
  if (pref.mode === "light") return pref.light;
  if (pref.mode === "dark") return pref.dark;
  return systemPrefersDark() ? pref.dark : pref.light;
}

// Applies the theme to <html>, tells the desktop shell (no-op in a browser),
// and notifies the color hook. Returns the id it resolved to.
export function applyPref(pref: ThemePref): ThemeId {
  const id = resolvePref(pref);
  document.documentElement.setAttribute("data-theme", id);
  window.euphonia?.setTheme?.(id);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: id }));
  return id;
}

// Subscribe to OS light/dark flips. Returns an unsubscribe function.
export function onSystemThemeChange(cb: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
