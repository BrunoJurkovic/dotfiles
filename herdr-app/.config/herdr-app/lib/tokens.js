// Source: ~/.dotfiles/herdr-app/.config/herdr-app/lib/tokens.js (copied in by herdr-reload; edit there).
// Design tokens, the one vocabulary every mod imports: type scale and weights, spacing, radii, row/control
// heights, icon sizes, Macchiato constants (PEACH for another machine, CRUST for ink on pastels), tint() /
// over() for alpha fills, and shades(): the few derived colours the recipes share (island, urgent tints,
// the avatar badge's plate). Colour *roles* are theme()'s: herdrrc pins them to Macchiato, so a mod
// reads t.foreground / t.muted / t.dim / t.hover / t.selected / t.border and never writes a hex of its own.
// No `herdr` import, so the theme comes in as `t`: the usage panel's art runs outside Herdr too (jsc).

// px. 11 meta (chips, section labels, timers, hints), 12 secondary, 13 primary, 15 dialog title only.
export const T = { meta: 11, small: 12, body: 13, title: 15 };
// 400 body, 500 labels / chips / buttons, 600 names and titles. Never 700.
export const W = { body: 400, label: 500, name: 600 };
// 2 · 4 · 6 · 8 · 12 · 16 · 20.
export const S = { hair: 2, xs: 4, sm: 6, md: 8, lg: 12, xl: 16, xxl: 20 };
// hit 4 tiny areas, btn 6 icon buttons, tile 7 avatar, row 8 rows/inputs/buttons, island 13, card 14 (pane, panel, dialog, popup).
// A pill is height / 2: chip 9, pill 10, island 13.
export const R = { hit: 4, btn: 6, tile: 7, row: 8, island: 13, card: 14 };
export const H = {
  bar: 40, status: 26, island: 26, pill: 20, chip: 18, icon: 24, row: 28,
  session: 44, sub: 26, field: 32, panel: 40, repo: 30,
};
// 14 rows and toolbars, 12 inline in chips and the status bar, 16 empty states only; the state badge is a 10
// mark on a 14 disc.
export const I = { row: 14, inline: 12, empty: 16, badge: 10, disc: 14 };
// Digits, timers, counts, shortcuts and paths. Terminals stay MonaspiceNe.
export const MONO = "GeistMono Nerd Font Mono";

// Catppuccin Macchiato, for what theme() has no role for.
export const MAC = {
  rosewater: "#f4dbd6", flamingo: "#f0c6c6", pink: "#f5bde6", mauve: "#c6a0f6", red: "#ed8796", maroon: "#ee99a0",
  peach: "#f5a97f", yellow: "#eed49f", green: "#a6da95", teal: "#8bd5ca", sky: "#91d7e3", sapphire: "#7dc4e4",
  blue: "#8aadf4", lavender: "#b7bdf8", text: "#cad3f5", subtext1: "#b8c0e0", subtext0: "#a5adcb",
  overlay2: "#939ab7", overlay1: "#8087a2", overlay0: "#6e738d", surface2: "#5b6078", surface1: "#494d64",
  surface0: "#363a4f", base: "#24273a", mantle: "#1e2030", crust: "#181926",
};
// Peach is the machine other than this Mac and nothing else; never theme-derived.
export const PEACH = MAC.peach;
// Ink on a pastel tile or an accent fill.
export const CRUST = MAC.crust;

// A repo's colour when herdrrc pins none (space_color): a stable pick from the Macchiato accents by an FNV-1a
// hash of its key (names.js colorKey), so the sidebar, the launcher and the board agree on it for good. Red and
// green are left out: they mean blocked and done.
// rosewater flamingo pink mauve maroon peach yellow teal sky sapphire blue lavender
const ACCENTS = ["#f4dbd6", "#f0c6c6", "#f5bde6", "#c6a0f6", "#ee99a0", "#f5a97f", "#eed49f", "#8bd5ca", "#91d7e3", "#7dc4e4", "#8aadf4", "#b7bdf8"];
export function accentFor(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return ACCENTS[(h >>> 0) % ACCENTS.length];
}

const hex2 = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0");

// A colour with an alpha: tint(PEACH) is the 15 % chip fill; tint(hex, 0.5) or tint(hex, "80") for others.
// `hex` is #rrggbb (an #rrggbbaa keeps its colour and takes the new alpha).
export function tint(hex, alpha = "26") {
  return hex.slice(0, 7) + (typeof alpha === "number" ? hex2(alpha) : alpha);
}

// `top` (#rrggbbaa) composited on `base` (#rrggbb): the solid colour it looks like. Used to match
// the avatar badge's disc to the row fill under it.
export function over(base, top) {
  const ok = (h) => /^#[0-9a-f]{6}/i.test(h);
  if (!ok(base) || !ok(top)) return base;
  const a = top.length >= 9 ? parseInt(top.slice(7, 9), 16) / 255 : 1;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [b, f] = [rgb(base), rgb(top)];
  return `#${b.map((c, i) => Math.round(c * (1 - a) + f[i] * a).toString(16).padStart(2, "0")).join("")}`;
}

// The derived colours the shared recipes use, from the theme's roles (`t`: theme()).
//   cursor    keyboard choice in a picker (never the same fill as hover)
//   active    the active toggle / segmented pill: accent at 15 %
//   island    sketchybar's island: base at 94 % with a surface1 55 % hairline
//   urgent    the island tinted by its top state, as the bar does: blocked red, done green
//   plate     the solid fill of a chrome row at rest / hovered / selected (the avatar badge's disc matches it)
export function shades(t) {
  return {
    cursor: tint(t.accent, 0.15),
    active: tint(t.accent, 0.15),
    island: { bg: `${MAC.base}f0`, border: tint(MAC.surface1, 0.55) },
    urgent: {
      blocked: { bg: over(MAC.base, tint(t.blocked, 0.22)), border: tint(t.blocked, 0.5) },
      done: { bg: over(MAC.base, tint(t.done, 0.22)), border: tint(t.done, 0.5) },
    },
    plate: { rest: t.chrome, hover: over(t.chrome, t.hover), selected: over(t.chrome, t.selected) },
  };
}

// Weight by number: weight(el, W.name). 400 normal, 500 medium, 600 semibold.
export function weight(el, w) {
  return w >= 600 ? el.font_semibold() : w >= 500 ? el.font_medium() : el.font_normal();
}
