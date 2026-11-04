// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/pane-header (copied in by herdr-reload; edit there).
// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane-header" } } } }
// Cloned from Herdr's `pane`. On the chrome colour with a 2 px rule in the pane's repo colour under it
// (shared "space.colors", pinned by the space-colors mod, as JankyBorders follows the yabai space):
// the program's icon, the agent's clean session name (omp titles look like `π ⠋ fix the bar` or
// `omp: name`) or the terminal's title, the agent's state (the shape and word the sidebar and the session
// bar use, `working 4m`), a peach chip for a pane on another machine, the branch and the folder. Split,
// zoom and close fade in while the pointer is on the header itself. A tab's only pane gets no header (a
// header over the one terminal would cover omp's top rows), so `lone: true` frames it safely.
// Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, spaces, props, run, theme, home, shared } from "herdr";
import { T, W, S, I, MONO, weight } from "./lib/tokens.js";
import { RANK, WORD, stateMark, stateColor, stateTime } from "./lib/state.js";
import { sessionName, machineOf } from "./lib/names.js";
import { machineChip, iconButton } from "./lib/ui.js";

const MOD = "pane-header";
const STRIP = 2;
const ROOM = 56; // px the branch and folder need to show anything: narrower, they give way entirely

// This Mac's home folder never changes: one host call, not one per render.
let HOME;
const here = () => (HOME ??= home());

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd, machine) {
  if (!cwd) return "";
  if (machine) return cwd.replace(/^\/(?:home\/[^/]+|root)(?=\/|$)/, "~");
  const h = here();
  return cwd === h ? "~" : cwd.startsWith(`${h}/`) ? `~${cwd.slice(h.length)}` : cwd;
}

const mono = (el) => el.font_family(MONO);

export default class Pane extends View {
  init() { this.hovered = false; this.room = true; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  // Split / zoom / close: 24×24, dim until hovered. The press is the button's own, not a pane focus.
  button(t, id, tip, icon, command, args) {
    return iconButton(id, `mods/pane-header/${icon}.svg`, {
      tip, color: t.dim, t,
      onClick: () => { if (this.hovered) run(command, args); },
    });
  }

  // The agent's state: its shape (a spinner while it works), then the word in the state's colour; a
  // working agent adds how long it has been at it. Idle reads in dim, a plain shell has no state.
  state(t, st, time) {
    if (!(st in RANK)) return null;
    const tone = st === "idle" ? t.dim : stateColor(st, t);
    return h_flex().flex_none().items_center().gap(S.xs).text_size(T.meta).font_medium().text_color(tone).whitespace_nowrap()
      .child(stateMark(MOD, st, I.inline, { t }))
      .child(WORD[st])
      .when(time != null, (el) => el.child(mono(div().child(time))));
  }

  render() {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const pane = p.pane;
    const space = spaces().find((s) => s.tabs.some((x) => x.id === p.tab));
    const tab = space?.tabs.find((x) => x.id === p.tab);
    if ((tab?.panes ?? 2) < 2) return div();
    const machine = space ? machineOf(space) : null;
    const agent = Boolean(p.program?.agent) || p.status != null;
    const cwd = folder(p.cwd, machine);
    const name = agent
      ? sessionName(p.title, p.program?.key, p.program?.name) || space?.name || cwd.split("/").pop() || p.program?.name || "agent"
      : ((p.program?.shell && p.program.name) || p.title || p.program?.name || "shell");
    const pic = icon(p.program, I.row, t.muted);
    const st = p.status;
    const time = st === "working" ? stateTime({ status: st, tabs: tab ? [tab] : [] }) : null;
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .relative()
      .px(S.lg)
      .gap(S.md)
      .items_center()
      .overflow_hidden()
      .bg(t.chrome)
      .border_b(STRIP)
      .border_color(shared("space.colors")?.[space?.id] ?? t.accent)
      .text_size(T.small)
      .on_hover((hovered, cx) => {
        if (this.hovered === hovered) return;
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(weight(div().flex_shrink(1).min_w(48).max_w(260).truncate().text_color(t.foreground), agent ? W.name : W.label).child(name))
      .when(st in RANK, (el) => el.child(this.state(t, st, time)))
      .when(Boolean(machine), (el) => el.child(machineChip(machine, t)))
      .child(h_flex().flex_1().min_w(0).overflow_hidden().items_center().gap(S.md).whitespace_nowrap().text_size(T.meta)
        .on_size_change((size, cx) => {
          const room = size.width >= ROOM;
          if (room === this.room) return;
          this.room = room;
          cx.notify();
        })
        .when(this.room && Boolean(p.branch), (el) => el.child(h_flex().flex_none().gap(S.xs).items_center().text_color(t.muted)
          .child(svg("mods/workspace-chrome/branch.svg").size(I.inline).flex_none())
          .child(p.branch)))
        .when(this.room, (el) => el.child(mono(div().flex_none().text_color(t.dim)).child(cwd))))
      .child(h_flex().absolute().top(0).right(0).bottom(0).items_center().pl(S.md).pr(S.md).bg(t.chrome)
        .opacity(this.hovered ? 1 : 0).transition("opacity", { duration: 120, easing: "ease-out" })
        .child(this.button(t, `ph-r-${pane}`, "Split right", "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "Split down", "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "Unzoom" : "Zoom", p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "Close", "close", "pane.close", { pane })));
  }
}
