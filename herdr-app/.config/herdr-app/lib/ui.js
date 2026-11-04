// Source: ~/.dotfiles/herdr-app/.config/herdr-app/lib/ui.js (copied in by herdr-reload; edit there).
// The shared pieces of Herdr's look, as builders that return an element to keep chaining: chip, island,
// pill, card, avatar tile with its state badge, state tag, section header, icon button, and the hover /
// selected / cursor / focus recipes. Sizes, radii and colours come from tokens.js and theme(), so every
// mod's rows, chips and buttons are the same shape. Builders draw once per render: keep calls out of loops
// that run per frame, and cap the lists you map over.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { T, R, H, I, S, MONO, PEACH, CRUST, tint, shades } from "./tokens.js";
import { WORD, stateMark, stateColor } from "./state.js";

// Press handler for a control inside a window_drag block (the session bar): don't start a window drag.
export const stop = (_e, cx) => cx.stop_propagation();

// Chip: h 18, px 8, radius 9, 11/500, no border. A `tone` (#rrggbb) tints it (fill 15 %, text tone); none
// is the neutral chip (counts): raised fill, muted text.
export function chip(label, tone, t = theme()) {
  const el = h_flex().h(H.chip).px(S.md).flex_none().items_center().rounded(H.chip / 2).whitespace_nowrap().text_size(T.meta).font_medium();
  return (tone ? el.bg(tint(tone)).text_color(tone) : el.bg(t.raised).text_color(t.muted)).child(label);
}

// The peach chip for a machine other than this Mac.
export const machineChip = (name) => chip(name, PEACH);

// Island: h 26, radius 13, base at 94 % with a surface1 hairline (sketchybar's). `tone` "blocked" or "done"
// tints it by the top state, as the bar does. Defaults to inner padding 4 and gap 4; add children and
// `.flex_shrink(1).min_w(0).overflow_hidden()` where it may shrink.
export function island({ tone, pl = S.xs, pr = S.xs, gap = S.xs, t = theme() } = {}) {
  const c = shades(t);
  const look = c.urgent[tone] ?? c.island;
  return h_flex().h(H.island).pl(pl).pr(pr).gap(gap).items_center().rounded(R.island).bg(look.bg).border(1).border_color(look.border);
}

// Pill inside an island: h 20, radius 10; icon-only is 28 wide, with a label it takes px 8. Active is the
// accent at 15 % with accent text; inactive is muted and hovers to `hover`. `tip` is the tooltip.
export function pill({ id, icon, label, active = false, tip, onClick, w = 28, t = theme() } = {}) {
  const c = shades(t);
  return h_flex().id(id).h(H.pill).flex_none().items_center().justify_center().gap(S.xs).rounded(H.pill / 2)
    .text_size(T.small).font_medium().whitespace_nowrap()
    .when(label, (el) => el.px(S.md))
    .when(!label, (el) => el.w(w))
    .when(active, (el) => el.bg(c.active).text_color(t.accent))
    .when(!active, (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)))
    .when(tip, (el) => el.tooltip(tip))
    .on_mouse_down("left", stop)
    .on_click(onClick)
    .when(icon, (el) => el.child(svg(icon).size(I.row).flex_none()))
    .when(label, (el) => el.child(label));
}

// Card: the pane / panel / dialog surface, radius 14, the terminal's background, 1 px border.
export function card(t = theme()) {
  return v_flex().bg(t.background).border(1).border_color(t.border).rounded(R.card).overflow_hidden();
}

// Avatar: a rounded tile in the repo's colour (#rrggbb) carrying the session's face: omp's icon for it (`icon`,
// a Nerd Font glyph or an emoji, see names.js nameParts), else the initial of `initial`. At rest the tile is
// the colour at 20 % with the face in the colour; `solid` (the session you are in) fills it, face in crust.
// From 24 (radius 7; 28 takes the row radius 8) a state badge sits at its bottom right: a 14 disc in `plate`
// (the fill of the row it is on, so it reads as an optical ring) holding the 10 state shape, and the face moves
// 1 px up and left so the badge never covers it. Idle shows no badge (calm), a plain shell the terminal glyph.
// At 18 (radius 6) there is no badge. `still` draws a working badge static (the rail); `badge` is an element to
// use as the badge instead (lib/motion.js pulseBadge, whose disc breathes).
export function avatar({ mod, color, initial, icon = "", status = "idle", size = 24, plate, still = false, solid = false, badge = null, t = theme() }) {
  const mark = badge ?? (size >= 24 && status !== "idle"
    ? div().absolute().right(-4).bottom(-4).size(I.disc).rounded(I.disc / 2).bg(plate ?? t.chrome)
      .flex().items_center().justify_center().child(stateMark(mod, status, I.badge, { still, t }))
    : null);
  const face = icon
    ? div().font_family(MONO).text_size(Math.round(size * 0.58)).child(icon)
    : div().text_size(size >= 28 ? T.small : T.meta).font_semibold().child((String(initial ?? "").match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase());
  const tile = div().relative().size(size).flex_none().flex().items_center().justify_center()
    .rounded(size >= 28 ? R.row : size >= 24 ? R.tile : 6).bg(solid ? color : tint(color, 0.2)).text_color(solid ? CRUST : color)
    .when(Boolean(mark), (el) => el.pr(2).pb(2)).child(face);
  return mark ? tile.child(mark) : tile;
}

// A state's label in its colour, 11/500: `needs you`, `finished`, `working`, `idle`. With `shape`, the state
// shape (12) comes first. `label` replaces the word (`3 needs you`). Null for a status with no word.
export function stateTag(mod, status, { shape = false, label, t = theme() } = {}) {
  const word = label ?? WORD[status];
  if (!word) return null;
  const color = stateColor(status, t);
  return h_flex().flex_none().items_center().gap(S.xs).text_size(T.meta).font_medium().text_color(color).whitespace_nowrap()
    .when(shape, (el) => el.child(stateMark(mod, status, I.inline, { t })))
    .child(word);
}

// Section label: 11/500 dim, sentence case, `h` 28 by default; `right` is an element for the far end.
export function sectionHeader(label, { right, h = H.row, t = theme() } = {}) {
  return h_flex().h(h).flex_none().items_center().justify_between().text_size(T.meta).font_medium().text_color(t.dim)
    .child(label)
    .when(right, (el) => el.child(right));
}

// Icon button: 24×24 hit, radius 6, a 14 icon (an svg path, or an element) muted → foreground on hover.
// `on` keeps it in the foreground colour; `size` 26 with `radius` 13 makes the bar's round + button.
// It stops the press, so it works inside a window_drag block.
export function iconButton(id, icon, { size = H.icon, radius = R.btn, tip, onClick, on = false, color, t = theme() } = {}) {
  return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(radius)
    .text_color(color ?? (on ? t.foreground : t.muted))
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .when(tip, (el) => el.tooltip(tip))
    .on_mouse_down("left", stop)
    .on_click(onClick)
    .child(typeof icon === "string" ? svg(icon).size(I.row).flex_none() : icon);
}

// Row fill recipes, on any row or button. Hover: `hover` fill, text to foreground. Selected (the current
// location): `selected` fill. Cursor (a keyboard choice in a picker): accent at 15 %, never the hover fill.
// Disabled: 40 % opacity, no hover. Rows never show a pointer cursor and never move or scale.
export function rowFill(el, t = theme(), { selected = false, cursor = false, disabled = false } = {}) {
  if (disabled) return el.opacity(0.4);
  if (cursor) return el.bg(shades(t).cursor).text_color(t.foreground);
  if (selected) return el.bg(t.selected).text_color(t.foreground);
  return el.hover((s) => s.bg(t.hover).text_color(t.foreground));
}

// Focus ring on an input or segmented control: 1 px accent when focused, `input` otherwise. No glow.
export function focusRing(el, focused = false, t = theme()) {
  return el.border(1).border_color(focused ? t.accent : t.input);
}
