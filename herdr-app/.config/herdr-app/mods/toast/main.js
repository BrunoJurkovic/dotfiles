// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/toast (copied in by herdr-reload; edit there).
// Notifications, in the sessions list's words. Herdr draws every notify() with the mod named `toast`, its own
// included, as a 338 × 70 card in its frame at the bottom right, stacked; they go after 5 s (8 s for an error
// or a warning) unless the notification sets its own timeout.
//
//   agent    Herdr's alert when an agent needs Bruno or finished while he looked elsewhere ("<name> needs
//            you" / "<name> finished", agent.focus on its terminal): the session's avatar (repo colour, omp's
//            icon, the state badge), its tag and name, then the state's shape and word and where it works
//            (repo · branch), a peach chip for another machine. The card is tinted by the state, as the bar's
//            island is; one that needs Bruno carries the bar's beam along its top, the one thing that moves.
//            An agent with no session here (a sub-agent) keeps Herdr's words beside the state's mark.
//   other    a tile in the level's colour (error, warning, success, info), or the notification's own icon,
//            then its title and one line of its body: an error's last line, else the first; all of it on
//            hover.
//
// A click runs the notification's action (an agent's: go to it) and dismisses it; × only dismisses.
//
// ONE module, on purpose: it imports nothing from ./lib. Herdr loads a fresh copy of this mod for every
// notification and its JS engine never frees a loaded module (all mods share a 256 MB heap), so each import
// is paid again per toast for as long as Herdr runs; with lib/ it was seven modules a toast, and a burst of
// them ran the heap out. The recipes below are lib's (ui.js avatar / stateTag / chip / iconButton, motion.js
// beam, names.js nameParts / placeOf, tokens.js tint / over), copied: change them there and here together.
// Only lib's state SVGs are used, as files.
//
// Herdr ships a `toast` of its own and puts it back on every start, moving this one to toast-edited (with a
// note saying so): herdrrc-sync runs herdr-reload when Herdr starts, which brings this one back and clears
// toast-edited.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, agents, spaces, panes, shared, home } from "herdr";

const WIDTH = 338; // Herdr's toast, inside its frame
const FACE = 36;
const MONO = "GeistMono Nerd Font Mono";
const MAC = { overlay0: "#6e738d", yellow: "#eed49f", peach: "#f5a97f" };
// A notification that isn't an agent's: its level's colour (a theme role, else Macchiato) and Nerd Font glyph.
const LEVEL = {
  error: { role: "blocked", glyph: "\uf00d" },
  warning: { role: "yellow", glyph: "\uf12a" },
  success: { role: "done", glyph: "\uf00c" },
  info: { role: "accent", glyph: "\uf129" },
};
const WORD = { blocked: "needs you", done: "finished" };

// tokens.js: a colour at an alpha, and `top` (#rrggbbaa) composited on `base` (#rrggbb).
const tint = (hex, a) => hex.slice(0, 7) + Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, "0");
function over(base, top) {
  const a = top.length >= 9 ? parseInt(top.slice(7, 9), 16) / 255 : 1;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [b, f] = [rgb(base), rgb(top)];
  return `#${b.map((c, i) => Math.round(c * (1 - a) + f[i] * a).toString(16).padStart(2, "0")).join("")}`;
}

const mark = (status, size, t) => svg(`mods/toast/lib/state-${status}.svg`).size(size).flex_none().text_color(t[status]);

// names.js: omp's icon and capital tag in front of a session's name, and where its agent works.
const ICON = /^(?:[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]|[\u{1F300}-\u{1FAFF}]\uFE0F?)(?=\s)/u;
const TAG = /^([A-Z0-9][A-Z0-9._-]{1,15}):\s+(\S.*)$/u;
function nameParts(name) {
  let s = (name ?? "").trim(), icon = "";
  const m = ICON.exec(s);
  if (m) { icon = m[0]; s = s.slice(icon.length).trim(); }
  const g = TAG.exec(s);
  return g ? { icon, tag: g[1], text: g[2] } : { icon, tag: "", text: s };
}
function placeOf(space) {
  const tabs = new Set(space.tabs.map((c) => c.id));
  const own = panes().filter((p) => p.terminal && tabs.has(p.tab));
  const pane = own.find((p) => p.status !== null) ?? own.find((p) => p.focused) ?? own[0];
  const cwd = (pane?.cwd || space.folder || "").replace(/\/+$/, "");
  const branch = pane?.branch ?? space.branch ?? "";
  const mine = home();
  const repo = !cwd || cwd === mine || /^\/(?:home|Users)\/[^/]+$/.test(cwd) ? "" : cwd.split("/").pop();
  const parts = [repo && repo.toLowerCase() !== space.name.toLowerCase() ? repo : "", branch].filter(Boolean);
  const where = parts.length ? parts.join(" · ") : cwd === mine ? "~" : cwd.startsWith(`${mine}/`) ? `~${cwd.slice(mine.length)}` : cwd;
  return { repo, where };
}

// ui.js avatar: the repo colour at 20 % with omp's icon (else the initial) in the colour; the state badge on a
// 14 disc in the card's own fill at the bottom right.
function avatar(color, icon, initial, status, plate, t) {
  const face = icon
    ? div().font_family(MONO).text_size(Math.round(FACE * 0.58)).child(icon)
    : div().text_size(12).font_semibold().child((String(initial).match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase());
  return div().relative().size(FACE).flex_none().flex().items_center().justify_center().rounded(8)
    .bg(tint(color, 0.2)).text_color(color).pr(2).pb(2).child(face)
    .child(div().absolute().right(-4).bottom(-4).size(14).rounded(7).bg(plate).flex().items_center().justify_center().child(mark(status, 10, t)));
}

// motion.js beam: a soft 72 px segment of the state's colour sweeping along the top edge, natively.
function beam(color) {
  const n = 18, step = 4, w = n * step;
  const band = h_flex().id("toast-beam-seg").absolute().top(0).left(-w).w(w).h(2)
    .children(Array.from({ length: n }, (_, i) => div().w(step).h(2).flex_none().bg(tint(color, 0.95 * Math.sin((Math.PI * (i + 0.5)) / n) ** 2))))
    .loop("left", { from: -w, to: WIDTH, period: 2400, easing: "ease-in-out" });
  return div().id("toast-beam").absolute().top(0).left(0).right(0).h(2).overflow_hidden().child(band);
}

// Herdr's agent alert, by its wording: "blocked", "done" or null.
function alertOf(p) {
  if (p.action?.name !== "agent.focus") return null;
  const title = p.title ?? "";
  return title.endsWith(" needs you") ? "blocked" : title.endsWith(" finished") ? "done" : null;
}

// The session the alert is about: the space of the agent on its terminal.
function sessionOf(p) {
  const address = p.action?.args?.terminal;
  const agent = address ? agents().find((a) => a.address === address) : null;
  return agent ? spaces().find((s) => s.id === agent.space) ?? null : null;
}

export default class Toast extends View {
  init() {
    this.hov = false;
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const status = alertOf(p);
    const space = status ? sessionOf(p) : null;
    const level = LEVEL[p.level] ?? LEVEL.info;
    const tone = status ? t[status] : (t[level.role] ?? MAC[level.role]);
    // The card: the popover tinted by what happened (red a little stronger), an info note plain; hovered, a
    // step lighter, and the avatar's badge plate follows so it still reads as a ring.
    const rest = status || p.level !== "info" ? over(t.popover, tint(tone, tone === t.blocked ? 0.14 : 0.1)) : t.popover;
    const fill = this.hov ? over(rest, t.hover) : rest;
    const name = (text) => div().flex_1().min_w(0).truncate().text_size(13).font_semibold().text_color(t.foreground).child(text);

    let face, top, bottom, tip = null;
    if (space) {
      const { icon, tag, text } = nameParts(space.name);
      const place = placeOf(space);
      face = avatar((shared("space.colors") ?? {})[space.id] ?? MAC.overlay0, icon, place.repo || space.name, status, fill, t);
      top = h_flex().gap(6).items_center()
        .when(Boolean(tag), (el) => el.child(div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(tag)))
        .child(name(text || space.name));
      bottom = h_flex().gap(6).items_center().text_size(11)
        .child(h_flex().flex_none().gap(4).items_center().font_medium().text_color(tone).whitespace_nowrap().child(mark(status, 12, t)).child(WORD[status]))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(place.where))
        .when(Boolean(space.machine), (el) => el.child(h_flex().h(18).px(8).flex_none().items_center().rounded(9).whitespace_nowrap()
          .font_medium().bg(tint(MAC.peach, 0.15)).text_color(MAC.peach).child(space.machine)));
    } else {
      const lines = String(p.body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      const line = p.level === "error" ? lines.at(-1) : lines[0];
      face = div().size(FACE).flex_none().flex().items_center().justify_center().rounded(8).bg(tint(tone, 0.2)).text_color(tone)
        .child(status ? mark(status, 18, t)
          : p.icon ? image(p.icon).size(20)
          : div().font_family(MONO).text_size(17).child(level.glyph));
      top = name(p.title ?? "");
      bottom = line ? div().truncate().text_size(12).text_color(t.muted).child(line) : null;
      if (lines.length > 1 || (line ?? "").length > 40) tip = lines.join("\n");
    }

    const close = div().id("toast-close").size(24).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Dismiss")
      .on_click((_e, cx) => { cx.stop_propagation(); closeOverlay(p.overlay); })
      .child(svg("mods/workspace-chrome/x.svg").size(14).flex_none());
    return h_flex()
      .id("toast")
      .relative()
      .size_full()
      .rounded(7) // inside Herdr's frame (radius 8, 1 px border), whose clip is square: the tint stays in its curve
      .overflow_hidden()
      .pl(12)
      .pr(6)
      .gap(12)
      .items_center()
      .bg(fill)
      .on_hover((h, cx) => { if (h !== this.hov) { this.hov = h; cx.notify(); } })
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .when(status === "blocked", (el) => el.child(beam(tone)))
      .child(face)
      .child(v_flex().id("toast-text").flex_1().min_w(0).gap(2).child(top)
        .when(Boolean(bottom), (el) => el.child(bottom))
        .when(Boolean(tip), (el) => el.tooltip(tip)))
      .child(div().self_start().pt(6).child(close));
  }
}
