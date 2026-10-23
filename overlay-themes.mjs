export const OVERLAY_THEMES = Object.freeze([
  { id: "grimoire", name: "Grimoár", surface: "#181315", accent: "#d6b576" },
  { id: "inferno", name: "Pekelná výheň", surface: "#130d0d", accent: "#ff9e64" },
  { id: "astral", name: "Astrální magie", surface: "#0f1028", accent: "#bfaaff" },
  { id: "parchment", name: "Starý pergamen", surface: "#efe0bb", accent: "#743123" },
  { id: "nordic", name: "Severské runy", surface: "#101b22", accent: "#9ccbd8" },
  { id: "comic", name: "Komiksový kritfail", surface: "#f8d25e", accent: "#992d2a" },
  { id: "ice", name: "Ledové království", surface: "#e7f6fd", accent: "#205d7d" },
]);
export const DEFAULT_OVERLAY_THEME = "grimoire";
export const DISPLAY_MS = 20_000;
export const isOverlayTheme = value => OVERLAY_THEMES.some(theme => theme.id === value);
export const normalizeOverlayTheme = value => isOverlayTheme(value) ? value : DEFAULT_OVERLAY_THEME;

// Only separate an immediate injury at the start of the result. Damage from a
// future hit belongs with the ongoing consequence and must stay there.
export function splitOverlayEffect(value) {
  const text = String(value ?? "").trim();
  const match = /^(Utrpíš\s+\d+(?:d\d+)?\s+[^.!?\n]+?\s+poškození)(?:\.\s*|\s+a\s+|$)/u.exec(text);
  if (!match) return { damage: "", consequence: text };
  const consequence = text.slice(match[0].length).trim();
  return { damage: `${match[1]}.`, consequence };
}
