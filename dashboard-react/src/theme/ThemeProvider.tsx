import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type ThemeId, isDarkTheme } from "./themes";
import {
  type ThemePref,
  THEME_CHANGE_EVENT,
  applyPref,
  loadPref,
  onSystemThemeChange,
  resolvePref,
  savePref,
} from "./themeStore";

export interface ThemeColors {
  zoneMasc: string;
  zoneMascInk: string;
  zoneFem: string;
  zoneNeutral: string;
  zoneGrow: string;
  zoneSoft: string;
  zoneComfy: string;
  zoneStrong: string;
  accent: string;
  accent2: string;
  /** bold small-text callout color (e.g. "this take is better") — a distinct
   *  token from `accent` because `accent` alone is too pale for foreground
   *  text on a near-white card in the light themes. */
  accentEmphasis: string;
  ink: string;
  inkSoft: string;
  /** a second, slightly different muted-text shade used by a couple of chart
   *  axis labels that were never actually `inkSoft` in the original design. */
  inkFaint: string;
  inkAccent: string;
  card: string;
  line: string;
  lineSoft: string;
  onZone: string;
  onAccent: string;
  wave: string;
  waveProgress: string;
  waveCursor: string;
  /** the waveform player's volume glyph — its own lavender shade, close to
   *  but distinct from `wave`. */
  waveIcon: string;
  /** five mutually-distinct series colors for the "Trends over time" mini
   *  charts, one per metric card — see index.css for why these are their
   *  own tokens rather than reusing `accent`/`accent2`. */
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  /** background wash paired with chart3 (the "phrase endings landed" band). */
  chart3Band: string;
}

const TOKEN_OF: Record<keyof ThemeColors, string> = {
  zoneMasc: "--zone-masc",
  zoneMascInk: "--zone-masc-ink",
  zoneFem: "--zone-fem",
  zoneNeutral: "--zone-neutral",
  zoneGrow: "--zone-grow",
  zoneSoft: "--zone-soft",
  zoneComfy: "--zone-comfy",
  zoneStrong: "--zone-strong",
  accent: "--accent",
  accent2: "--accent-2",
  accentEmphasis: "--accent-emphasis",
  ink: "--ink",
  inkSoft: "--ink-soft",
  inkFaint: "--ink-faint",
  inkAccent: "--ink-accent",
  card: "--card",
  line: "--line",
  lineSoft: "--line-soft",
  onZone: "--on-zone",
  onAccent: "--on-accent",
  wave: "--wave",
  waveProgress: "--wave-progress",
  waveCursor: "--wave-cursor",
  waveIcon: "--wave-icon",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
  chart3Band: "--chart-3-band",
};

// One getComputedStyle read per theme change, not per component per render.
function readColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const out = {} as ThemeColors;
  for (const key of Object.keys(TOKEN_OF) as (keyof ThemeColors)[]) {
    out[key] = style.getPropertyValue(TOKEN_OF[key]).trim();
  }
  return out;
}

interface ThemeContextValue {
  pref: ThemePref;
  resolved: ThemeId;
  colors: ThemeColors;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => loadPref());
  const [resolved, setResolved] = useState<ThemeId>(() => resolvePref(loadPref()));
  const [colors, setColors] = useState<ThemeColors>(() => readColors());

  // Re-read the computed tokens whenever the applied theme changes.
  useEffect(() => {
    const onChange = () => setColors(readColors());
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  }, []);

  // The pre-paint script in index.html already set data-theme; this re-applies
  // through the same path so the desktop shell and the color hook both hear it.
  useEffect(() => {
    setResolved(applyPref(pref));
  }, [pref]);

  // Follow the OS while in auto mode.
  useEffect(() => {
    if (pref.mode !== "auto") return;
    return onSystemThemeChange(() => setResolved(applyPref(pref)));
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    savePref(next);
    setPrefState(next);
  }, []);

  // Flip to the other family, committing to an explicit mode.
  const toggle = useCallback(() => {
    setPref({ ...pref, mode: isDarkTheme(resolved) ? "light" : "dark" });
  }, [pref, resolved, setPref]);

  const value = useMemo(
    () => ({ pref, resolved, colors, setPref, toggle }),
    [pref, resolved, colors, setPref, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export function useTheme() {
  const { pref, resolved, setPref, toggle } = useThemeContext();
  return { pref, resolved, setPref, toggle };
}

export function useThemeColors(): ThemeColors {
  return useThemeContext().colors;
}
