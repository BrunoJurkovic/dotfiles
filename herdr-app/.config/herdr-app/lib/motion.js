// Source: ~/.dotfiles/herdr-app/.config/herdr-app/lib/motion.js (copied in by herdr-reload; edit there).
// Herdr's motion language: a few small cues for what is alive or needs Bruno, nothing else. Every builder is
// native-only (frames / loop run in the host, render never runs for them, they stop when not drawn); no JS
// timers. What it costs decides how it is used. Measured on the dev window (rail collapsed, panel closed;
// idle 1.5 %): a `frames` cue ticks a few times a second (the dot wave: +4 %); any `loop` keeps the whole
// window redrawing at ~30 fps (about +11 %, whatever it animates, and it is not additive: a second loop
// costs ~1-2 % more). A band built as a gradient path cost more than the strips used now. So: ONE
// continuous animation per visible surface, only while its condition holds (a session working, a session
// needing you, a panel loading), and nothing moves when everything is idle or finished. With a session
// working in the bar and any blocked badge in the rail: 14-15 %; needs-you bar + badge: 14-15 %.
//
//   pixelWave   a dot-matrix wave beside the elapsed timer: "this agent is working" (session bar; the board's
//               working lane header). Colour = working blue. Frames, one shared clock: the cheap cue.
//   pulse       opacity breathing: "this needs you" on a badge or a state tag. A loop.
//   pulseBadge  the avatar's state badge with only its mark breathing (the plate stays solid, so the optical
//               ring holds): a blocked session in the list or on the rail. A loop.
//   beam        a short bright segment that ping-pongs along an element's top edge: the Border Beam cue for
//               the needs-you island. Child of a `relative()` parent (the track clips the segment). A loop.
//   shimmer     a soft light band sweeping across a block: loading skeletons (it was tried on the working
//               session's name and dropped: +6 % for a barely visible light). A loop; loading only.
//   skeleton    a placeholder block with a shimmer inside: loading states (PRs, board).
//   moving      moving("wave") says whether a cue is on, so a mod keeps a still fallback (the spinner).
//
// Pairing per surface: working → pixelWave; needs you → beam + pulse on the tag; blocked row in a list →
// pulseBadge, and nothing else moving; loading → skeleton group. Never animate a list of rows, a finished
// state or an idle one. MOTION is the master switch, CUES switches one cue off (a still fallback for each).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { MONO, I, tint } from "./tokens.js";
import { stateMark } from "./state.js";

// ── the soft band ─────────────────────────────────────────────────────────────────────────────────────
// There is no gradient element for a mod (only a path with a Background, and a path is repainted every
// frame of a loop: measured costlier than plain quads), so a band is a row of solid strips whose alpha
// follows a raised-cosine profile: clear at both ends, `peak` in the middle. 2-3 px strips at most 12 %
// alpha apart read as a smooth fade.
const profiles = new Map();
function strips(n, peak) {
  const key = `${n}|${peak}`;
  if (!profiles.has(key)) profiles.set(key, Array.from({ length: n }, (_, i) => peak * Math.sin((Math.PI * (i + 0.5)) / n) ** 2));
  return profiles.get(key);
}

// A horizontal soft band of `color`, `width` wide, peaking at `peak` (alpha, 0-1), in strips `grain` px wide
// (fewer strips are cheaper: a faint band can be coarse, a bright line cannot). `h` is a height in px, or
// omitted to fill the parent's height.
function band(width, h, color, peak, grain = 4) {
  const n = Math.max(5, Math.round(width / grain)), step = width / n;
  const row = h_flex().flex_none().w(width)
    .children(strips(n, peak).map((alpha) => {
      const el = div().w(step).flex_none().bg(tint(color, alpha));
      return h == null ? el.h_full() : el.h(h);
    }));
  return h == null ? row.h_full() : row.h(h);
}

// Master switch. Off: every builder returns its still equivalent (no loops, no frames, no shimmer
// bands), so the window never redraws for motion. Turned off after the live app froze with the
// working-state motion on (2026-10-29); turn on only after proving it cheap in a dev instance.
export const MOTION = true;
// Each cue's own switch (a cue moves only while MOTION and its own are on): to isolate one that misbehaves.
const CUES = { pulse: true, wave: true, beam: true, shimmer: true };
// Whether a cue moves right now: a mod asks before it reserves room for one (a still fallback otherwise).
export const moving = (cue) => MOTION && CUES[cue];
const live = moving;

// ── pulse ─────────────────────────────────────────────────────────────────────────────────────────────

// Opacity breathing on `el` between `from` and `to`, one full breath per `period` ms. The element should
// carry an id so a re-render doesn't restart it.
export function pulse(el, { from = 0.45, to = 1, period = 1800 } = {}) {
  if (!live("pulse")) return el;
  return el.loop("opacity", { from, to, period, easing: "ease-in-out" });
}

// The avatar's state badge (a 14 disc in the row's plate fill at its bottom right, holding the 10 mark) with
// only the mark breathing. Same geometry as ui.js avatar(): pass `status: "idle"` to avatar() so it draws
// the tile alone, and add this as the tile's last child. `plate` is the row fill the disc must match.
export function pulseBadge({ mod, status = "blocked", plate, id = "badge", t = theme(), ...breath } = {}) {
  return div().absolute().right(-4).bottom(-4).size(I.disc).rounded(I.disc / 2).bg(plate ?? t.chrome)
    .flex().items_center().justify_center()
    .child(pulse(div().id(id).flex().items_center().justify_center().child(stateMark(mod, status, I.badge, { t })), breath));
}

// ── pixelWave ─────────────────────────────────────────────────────────────────────────────────────────

const DOTS = ["·", "•", "●", "•"];
const waves = new Map();
// One frame list per cell: the same cycle, rotated by column (and row) so the wavefront travels across.
function lists(glyphs, cols, rows, lag, rowLag) {
  const key = `${glyphs.join("")}|${cols}|${rows}|${lag}|${rowLag}`;
  if (!waves.has(key)) {
    const n = glyphs.length;
    waves.set(key, Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
      const shift = c * lag + r * rowLag;
      return glyphs.map((_g, k) => glyphs[(((k - shift) % n) + n) % n]);
    })));
  }
  return waves.get(key);
}

// A cols × rows dot-matrix wave: each cell is a frames() element, its cycle rotated by column (and a step
// per row for a slight diagonal), so the wavefront travels left to right. `cell` px square (4 × 3 at 5 is
// 20 × 15, small enough to sit beside an 11 px timer); `ms` per step, so a cycle is glyphs.length × ms.
// `glyphs` is the cycle, smallest to largest and back (default · • ● •). Colour defaults to working blue.
export function pixelWave(t = theme(), { cols = 4, rows = 3, color, ms = 160, cell = 5, glyphs = DOTS, lag = 1, rowLag = 1, id = "wave" } = {}) {
  if (!live("wave")) return div().id(id);
  const ink = color ?? t.working;
  const grid = lists(glyphs, cols, rows, lag, rowLag);
  return v_flex().id(id).flex_none()
    .children(grid.map((line, r) => h_flex().flex_none().children(line.map((frames, c) =>
      div().id(`${id}-${r}-${c}`).size(cell).flex_none().overflow_hidden().flex().items_center().justify_center()
        .font_family(MONO).text_size(Math.round(cell * 1.6)).line_height(`${cell}px`).text_color(ink)
        .frames(frames, ms)))));
}

// ── beam ──────────────────────────────────────────────────────────────────────────────────────────────

// A short bright segment that ping-pongs along the top edge of its `relative()` parent, clipped to it: the
// Border Beam cue. `span` is the parent's width (an estimate is fine: past the edge it is simply clipped);
// `h` is the line's thickness. Add as a child of the element that should carry it.
export function beam(t = theme(), { width = 72, color, period = 2400, span = 320, h = 2, id = "beam" } = {}) {
  if (!live("beam")) return div().id(id);
  const ink = color ?? t.blocked;
  return div().id(id).absolute().top(0).left(0).right(0).h(h).overflow_hidden()
    .child(band(width, h, ink, 0.95).id(`${id}-seg`).absolute().top(0).left(-width)
      .loop("left", { from: -width, to: span, period, easing: "ease-in-out" }));
}

// ── shimmer, skeleton ─────────────────────────────────────────────────────────────────────────────────

// A soft band of foreground (12 %) sweeping across and back over its `relative().overflow_hidden()` parent.
// `span` is the parent's width (a label's estimate is fine), `width` the band's.
export function shimmer(t = theme(), { width = 56, span = 160, period = 1800, peak = 0.12, color, id = "shimmer" } = {}) {
  if (!live("shimmer")) return div().id(id);
  return band(width, undefined, color ?? t.foreground, peak, 8).id(id).absolute().top(0).left(-width)
    .loop("left", { from: -width, to: span, period, easing: "ease-in-out" });
}

// A placeholder block: `raised` at 55 % with a shimmer inside. `w` is px, "fill" (flex_1, inside a row) or
// omitted (the full width of its column); `h` px; `radius` defaults to 6. `span` is the shimmer's travel
// (the block's width; default 320). `still` draws the block without the shimmer.
export function skeleton(t = theme(), { w, h = 12, radius = 6, span, period, still = false, id = "skeleton" } = {}) {
  const el = div().id(id).relative().overflow_hidden().h(h).flex_none().rounded(radius).bg(tint(t.raised, 0.55));
  const sized = w === "fill" ? el.flex_1().min_w(0) : w == null ? el.w_full() : el.w(w);
  return still || !live("shimmer") ? sized : sized.child(shimmer(t, { span: span ?? (typeof w === "number" ? w : 320), period, id: `${id}-shimmer` }));
}
