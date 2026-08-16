// The eight theme ids, split by family. "auto" mode swaps between the user's
// chosen favorite in each family, which is why the split lives here rather
// than being inferred from the css.
export type ThemeId =
  | "blossom"
  | "paper"
  | "light-mint"
  | "dusk-plum"
  | "dark-mint"
  | "midnight"
  | "cocoa"
  | "amber-night";

export const LIGHT_THEMES: ThemeId[] = ["blossom", "paper", "light-mint"];
export const DARK_THEMES: ThemeId[] = [
  "dusk-plum",
  "dark-mint",
  "midnight",
  "cocoa",
  "amber-night",
];

export const THEME_NAMES: Record<ThemeId, string> = {
  blossom: "blossom",
  paper: "paper",
  "light-mint": "light mint",
  "dusk-plum": "dusk plum",
  "dark-mint": "dark mint",
  midnight: "midnight",
  cocoa: "cocoa",
  "amber-night": "amber night",
};

export function isDarkTheme(id: ThemeId): boolean {
  return DARK_THEMES.includes(id);
}
