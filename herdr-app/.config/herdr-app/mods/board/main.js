// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/board (copied in by herdr-reload; edit there).
// The agent board: every session on every machine, in four lanes (Needs you, Working, Done, Idle), in the
// sessions sidebar's vocabulary: an avatar in the repo's colour carrying omp's icon for the session, with the
// state as its badge, the session's tag and name, where it works (repo · branch), a peach chip for another
// machine and one time (working since, or how long ago it changed). Idle is a lane of one-line rows so the
// lanes that want you keep the room, and a lane with nothing in it shrinks to its header. One mod, three
// blocks of layouts.d/board.json, picked by props().role:
//   none     the lanes. Click a card: agent.focus, and the workspace below shows that session's terminals.
//   header   the window's drag bar: the traffic lights' room, the title, a chip per machine and +, which
//            opens the launcher (mods/launch; the board has no session bar, so it offers it itself).
//   rail     what the workspace below shows: its session, machine and where it works.
// setAgentOrder() follows the lanes left to right, so ctrl-alt-n / ctrl-alt-p walk the board.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, machines, panes, props, run, setAgentOrder, shared, spaces, theme, window } from "herdr";
import { T, R, H, S, I, W, MONO, MAC, PEACH, tint, over, weight } from "./lib/tokens.js";
import { stateColor, stateMark, stateTime } from "./lib/state.js";
import { worked, ago } from "./lib/time.js";
import { machineOf, nameParts, placeOf, sessionName } from "./lib/names.js";
import { avatar, chip, iconButton, machineChip } from "./lib/ui.js";

const MOD = "board";
const LANES = [
  { key: "blocked", label: "Needs you" },
  { key: "working", label: "Working" },
  { key: "done", label: "Done" },
  { key: "idle", label: "Idle" },
];
const DAY = 24 * 60 * 60 * 1000;
const CARD_H = 64;
const CARD_R = 12; // a card sits on the canvas inside the window's 14: one step in, as the brief draws it
const EMPTY_W = 96; // a lane with nothing in it is its header and "None"
// The lane's bottom 16 px, sixteen 1 px steps from clear to the canvas: a card the edge cuts reads as "more below".
const FADE = Array.from({ length: 16 }, (_, i) => (i + 1) / 16);

const mono = (el) => el.font_family(MONO);
const fade = (t) => v_flex().absolute().left(0).right(0).bottom(0).children(FADE.map((a) => div().h(1).bg(tint(t.canvas, a))));

export default class Board extends View {
  init(_props, cx) {
    if (props()?.role) return;
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    // The times count minutes: a gentle tick is enough.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a finished agent
  // turns done into idle, and looking isn't the agent doing anything. An agent met for the first
  // time starts from when its tab last changed state, if the core knows, else from now.
  track(list, tabs, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      const old = this.changed[a.address];
      if (old?.s === s) continue;
      const seen = tabs.get(a.tab)?.changed_at;
      const at = !old && Number.isFinite(seen) && seen <= now ? seen : now;
      this.changed[a.address] = { s, at };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * DAY) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays in Done until you leave it rather than drop
  // away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, status: cur.status } : null;
  }

  column(a) {
    return a.address === this.held?.address && this.held.status === "done" && a.status === "idle" ? "done" : a.status;
  }

  // The one time a card shows, as the sessions list does: working → how long it has worked, else how long
  // ago it changed. The tab's own clock first; an agent the core has no clock for counts from when the
  // board saw it.
  time(a, key, ctx) {
    const tab = ctx.tabs.get(a.tab);
    return stateTime({ status: key, tabs: tab ? [tab] : [] }, ctx.now) ?? (key === "working" ? worked : ago)(ctx.now - this.since(a));
  }

  // What a card says about an agent: the session's name in parts (session-names keeps its space named after
  // it), where it works, which machine, and the avatar's colour, icon and initial.
  about(a, ctx) {
    const space = ctx.spaces.get(a.space);
    const place = space ? ctx.place(space) : null;
    const full = space?.name || a.space_name || sessionName(a.title, "omp", a.app, a.program?.name) || a.program?.name || a.address;
    const { icon, tag, text } = nameParts(full);
    const repo = place?.repo;
    return {
      icon,
      tag,
      name: text || full,
      full: tag ? `${tag}: ${text}` : text || full,
      where: place?.where ?? "",
      machine: machineOf(a.address),
      color: ctx.colors[a.space] ?? MAC.overlay0,
      initial: repo && repo !== "~" && repo !== "/" ? repo : full,
    };
  }

  // The tag (dim) and the name on one line.
  title(t, x, el) {
    return h_flex().min_w(0).gap(S.sm).items_center()
      .when(Boolean(x.tag), (row) => row.child(div().flex_none().text_size(T.meta).font_semibold().text_color(t.dim).child(x.tag)))
      .child(el.flex_1().min_w(0).truncate().child(x.name));
  }

  // A card: avatar with the state as its badge, the name, where it works, and the machine chip and time.
  card(t, a, key, ctx) {
    const x = this.about(a, ctx);
    const tone = stateColor(key, t);
    const time = this.time(a, key, ctx);
    const fill = a.focused ? over(t.surface, t.selected) : t.surface;
    return h_flex()
      .id(`agent-${a.address}`)
      .w_full()
      .h(CARD_H)
      .flex_none()
      .px(S.md)
      .gap(10)
      .items_center()
      .rounded(CARD_R)
      .bg(fill)
      .border(1)
      .border_color(a.focused ? t.input : t.border)
      .hover((s) => s.border_color(tint(tone, 0.5)))
      .tooltip([x.full, x.where, x.machine].filter(Boolean).join(" · "))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(avatar({ mod: MOD, color: x.color, icon: x.icon, initial: x.initial, status: key, plate: fill, solid: a.focused, t }))
      .child(v_flex().flex_1().min_w(0)
        .child(this.title(t, x, weight(div().h(16).line_height("16px").text_size(T.body).text_color(t.foreground), W.name)))
        .child(div().h(14).line_height("14px").overflow_hidden().whitespace_nowrap().text_size(T.meta).text_color(t.dim).child(x.where))
        .child(h_flex().h(H.chip).gap(S.sm).items_center()
          .when(Boolean(x.machine), (el) => el.child(machineChip(x.machine)))
          .child(div().flex_1())
          .when(time != null, (el) => el.child(mono(div().flex_none().text_size(T.meta).font_medium().text_color(tone).child(time))))));
  }

  // Idle's one-line row: a small avatar, the name, a server mark when it lives on another machine, the time.
  row(t, a, ctx) {
    const x = this.about(a, ctx);
    const time = this.time(a, "idle", ctx);
    return h_flex()
      .id(`agent-${a.address}`)
      .w_full()
      .h(H.row)
      .flex_none()
      .px(S.md)
      .gap(S.md)
      .items_center()
      .rounded(R.row)
      .when(a.focused, (el) => el.bg(t.selected))
      .when(!a.focused, (el) => el.hover((s) => s.bg(t.hover)))
      .tooltip([x.full, x.where, x.machine].filter(Boolean).join(" · "))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(avatar({ mod: MOD, color: x.color, icon: x.icon, initial: x.initial, size: 18, solid: a.focused, t }))
      .child(this.title(t, x, weight(div().text_size(T.small).text_color(a.focused ? t.foreground : t.muted), W.label)).flex_1())
      .when(Boolean(x.machine), (el) => el.child(svg("mods/workspace-chrome/server.svg").size(I.inline).flex_none().text_color(PEACH)))
      .child(mono(div().flex_none().text_size(T.meta).text_color(t.dim).child(time)));
  }

  // The lane's header: the state's shape (drawn still: the cards' badges carry the motion), its name, and how many.
  head(t, lane) {
    const n = lane.cards.length;
    return h_flex().h(H.icon).flex_none().px(S.hair).gap(S.sm).items_center()
      .child(stateMark(MOD, lane.key, I.row, { still: true, t }))
      .child(weight(div().text_size(T.body).text_color(t.foreground).whitespace_nowrap(), W.name).child(lane.label))
      .when(n > 0, (el) => el.child(chip(String(n), undefined, t)));
  }

  lane(t, lane, ctx) {
    const idle = lane.key === "idle";
    const base = v_flex().h_full().min_w(0).gap(S.sm).child(this.head(t, lane));
    if (lane.cards.length === 0) {
      return base.w(EMPTY_W).flex_none().child(div().px(S.hair).pt(S.hair).text_size(T.meta).text_color(t.dim).child("None"));
    }
    // The last card scrolls clear of the fade, so it is never left under it.
    return base.flex_1()
      .child(v_flex().relative().flex_1().min_h(0)
        .child(v_flex().id(`lane-${lane.key}`).flex_1().min_h(0).w_full().gap(idle ? S.hair : S.sm).pb(16).overflow_y_scrollbar()
          .children(lane.cards.map((a) => (idle ? this.row(t, a, ctx) : this.card(t, a, lane.key, ctx)))))
        .child(fade(t)));
  }

  board(t) {
    const list = agents();
    const now = Date.now();
    const all = panes();
    const sp = spaces();
    const tabs = new Map(sp.flatMap((s) => s.tabs).map((x) => [x.id, x]));
    // One placeOf per space, however many agents it has.
    const places = new Map();
    const ctx = {
      now,
      tabs,
      colors: shared("space.colors") ?? {},
      spaces: new Map(sp.map((s) => [s.id, s])),
      place: (space) => {
        if (!places.has(space.id)) places.set(space.id, placeOf(space, all));
        return places.get(space.id);
      },
    };
    this.track(list, tabs, now);
    this.hold(list);
    // Newest change first within a lane; the address settles ties so cards never shuffle.
    const lanes = LANES.map((l) => ({
      ...l,
      cards: list.filter((a) => this.column(a) === l.key)
        .sort((x, y) => this.since(y) - this.since(x) || x.address.localeCompare(y.address)),
    }));
    setAgentOrder(lanes.flatMap((l) => l.cards.map((a) => a.address)));
    return h_flex().id("board-root").size_full().px(S.lg).pt(S.md).gap(S.md).bg(t.canvas).children(lanes.map((l) => this.lane(t, l, ctx)));
  }

  header(t) {
    const list = agents();
    const count = new Map();
    for (const a of list) count.set(machineOf(a.address), (count.get(machineOf(a.address)) ?? 0) + 1);
    // On macOS the traffic lights sit over this bar: the layout's `inset` keeps the title clear of them.
    const inset = window()?.platform === "macos" ? props()?.inset ?? 10 : 10;
    return h_flex().id("board-header-root").size_full().min_w(0).pl(inset).pr(10).gap(S.lg).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(weight(div().flex_none().text_size(T.body).text_color(t.foreground), W.name).child("Agent board"))
      .child(div().flex_shrink(1).min_w(0).truncate().text_size(T.small).text_color(t.dim).child(`${list.length} session${list.length === 1 ? "" : "s"}`))
      .child(div().flex_1())
      .child(h_flex().flex_none().gap(S.sm).items_center()
        .children(machines().map((m) => {
          const label = `${m.name ?? "This Mac"} ${count.get(m.name ?? null) ?? 0}`;
          return m.name ? machineChip(label) : chip(label, undefined, t);
        }))
        .child(iconButton("board-new", "mods/workspace-chrome/plus.svg", { size: H.island, radius: R.island, tip: "New session (⌘N)", onClick: () => run("mod.open", { name: "launch" }), t })));
  }

  rail(t) {
    const space = spaces().find((s) => s.active);
    if (!space) return div().size_full().bg(t.chrome);
    const all = panes();
    const tab = space.tabs.find((x) => x.active);
    const terminals = all.filter((p) => p.tab === tab?.id && p.terminal).length;
    const place = placeOf(space, all);
    const initial = place.repo && place.repo !== "~" && place.repo !== "/" ? place.repo : space.name;
    const { icon, tag, text } = nameParts(space.name);
    return h_flex().size_full().min_w(0).px(S.lg).gap(S.md).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(avatar({ mod: MOD, color: (shared("space.colors") ?? {})[space.id] ?? MAC.overlay0, icon, initial, size: 18, solid: true, t }))
      .when(Boolean(tag), (el) => el.child(div().flex_none().text_size(T.meta).font_semibold().text_color(t.dim).child(tag)))
      .child(weight(div().flex_none().max_w(260).truncate().text_size(T.body).text_color(t.foreground), W.name).child(text || space.name))
      .when(Boolean(space.machine), (el) => el.child(machineChip(space.machine)))
      .child(div().flex_1().min_w(0).overflow_hidden().whitespace_nowrap().text_size(T.small).text_color(t.dim).child(place.where))
      .when(terminals > 1, (el) => el.child(div().flex_none().text_size(T.meta).text_color(t.dim).child(`${terminals} terminals`)));
  }

  render() {
    const t = theme();
    const role = props()?.role;
    if (role === "header") return this.header(t);
    if (role === "rail") return this.rail(t);
    return this.board(t);
  }
}
