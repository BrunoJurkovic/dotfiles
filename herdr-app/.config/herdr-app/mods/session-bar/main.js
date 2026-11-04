// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/session-bar/main.js (copied in by herdr-reload; edit there).
// The 40 px top bar. A session is a space with one terminal, so for a space with one tab it shows the
// current session as an island (the sketchybar agents island's language): the avatar with omp's icon for the
// session, its tag and name, a peach chip when it lives on another machine, repo · branch, and what it needs
// or how long it has been at it; the island is tinted red when the session needs you and green when it
// finished. A space with 2+ tabs keeps the tab pills. On the right: the side panel toggles as icon pills in
// one island (labelled from 1000 px; Files and Changes always, PRs and Usage while the layout has those
// panels) and +, which opens the launcher (mods/launch: a recent folder or any folder, on either machine).
// The panel itself is the layout's state: a toggle acts on a click or a key command only, never from render.
//
// Key commands (herdrrc binds them as session-bar.<command>):
//   new-omp    a new space on the active space's machine, in the focused pane's folder, running omp
//   new-shell  the same with the machine's shell
//   usage      the Usage panel on, or off when it is already showing

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, focused, run, openOverlay, theme, window, shared, layout, props, nextCommand } from "herdr";
import { T, R, H, S, MONO, MAC, weight, W } from "./lib/tokens.js";
import { RANK, stateMark, stateColor, stateTime } from "./lib/state.js";
import { placeOf, nameParts } from "./lib/names.js";
import { avatar, island, machineChip, pill, iconButton, stateTag, stop } from "./lib/ui.js";
import { pixelWave, beam, pulse, moving } from "./lib/motion.js";

const MOD = "session-bar";
const WIDE = 1000; // bar width from which the panel toggles carry their labels
const WHERE_MIN = 560; // below this bar width the repo · branch segment gives way entirely

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
}

const mono = (el) => el.font_family(MONO);

export default class SessionBar extends View {
  init(_props, cx) {
    this.pressed = null;
    this.hovTab = null;
    localStorage.removeItem("panels"); // the old per-space panel memory, gone with syncPanel
    // The working timers read the clock: a gentle tick is enough, they count minutes.
    cx.timer.every(30000, (cx) => cx.notify());
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        // A reloaded build's old loop ends at its next cx use: touch it before acting.
        await cx.sleep(0);
        if (command === "new-omp") this.newSession(["omp"]);
        else if (command === "new-shell") this.newSession(null);
        else if (command === "usage") this.togglePanel("usage");
        cx.notify();
      }
    });
  }

  // A new space beside the one in front: on its machine, in the folder the focused pane is in.
  newSession(argv) {
    const now = focused();
    const space = spaces().find((s) => s.id === now?.space) ?? spaces().find((s) => s.active);
    const folder = now?.cwd ?? space?.folder;
    run("space.new", {
      ...(space?.machine ? { machine: space.machine } : {}),
      ...(folder ? { folder } : {}),
      ...(argv ? { argv } : {}),
    });
  }

  // The panel on `id`, or hidden when it already shows that. Only a click or a key command calls this:
  // whether the panel is open is the layout's own state, which survives reloads.
  togglePanel(id) {
    const panel = find(layout(), "panel"), body = find(layout(), "panel-body");
    if (!panel || !body || !find(body, id)) return;
    if (!panel.hidden && body.active === id) run("layout.hide", { id: "panel" });
    else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
  }

  // The session the bar names, as an island a size up from the others (h 30, radius 15, room either side):
  // avatar with omp's icon, tag, name, machine chip, repo · branch, state. Priorities when it is tight: the
  // avatar, chip and state never shrink; the name keeps about 96 px; repo · branch clips first (no ellipsis: a
  // clipped word reads better than `t…`) and goes entirely below 560 px.
  // Motion (one thing alive at a time, and only while it holds): working → a dot wave in place of the spinner
  // (frames: ticks 6 times a second); needs you → a beam along the island's top edge and the state tag
  // breathing (loops: the window redraws at 30 fps for them, so these are the costly ones); done and idle
  // are still. With motion off the bar is exactly its still self: spinner, plain tag.
  session(t, space, wide) {
    const place = placeOf(space, panes());
    const colors = shared("space.colors") ?? {};
    const status = space.status;
    const time = stateTime(space);
    const initial = place.repo && place.repo !== "~" && place.repo !== "/" ? place.repo : space.name;
    const { icon, tag, text } = nameParts(space.name);
    const name = text || space.name;
    const working = status === "working", needs = status === "blocked";
    const nameMin = Math.min(96, Math.round(name.length * 7));
    return h_flex().id("session").flex_1().min_w(0).h_full().items_center()
      .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "space", target: { id: space.id } } }))
      .child(island({ tone: needs || status === "done" ? status : undefined, pl: 5, pr: 14, gap: 10, t })
        .id("session-island").h(30).rounded(15).relative().flex_shrink(1).min_w(0).overflow_hidden()
        .when(needs && moving("beam"), (el) => el.on_size_change((size, cx) => {
          // The beam sweeps the island's width: follow it once it is known, not on every pixel.
          const w = Math.round(size.width);
          if (this.islandW !== undefined && Math.abs(w - this.islandW) < 8) return;
          this.islandW = w;
          cx.notify();
        }))
        .child(avatar({ mod: MOD, color: colors[space.id] ?? MAC.overlay0, icon, initial, size: 22, solid: true, t }))
        .child(h_flex().flex_shrink(1).min_w(0).gap(S.sm).items_center()
          .when(Boolean(tag), (el) => el.child(div().flex_none().text_size(T.meta).font_semibold().text_color(t.dim).child(tag)))
          .child(weight(div().id("session-name").flex_shrink(1).min_w(nameMin).truncate().text_size(T.body).text_color(t.foreground), W.name).child(name)))
        .when(Boolean(space.machine), (el) => el.child(machineChip(space.machine, t)))
        .when(Boolean(place.where) && wide, (el) => el.child(div().flex_shrink(8).min_w(0).overflow_hidden().whitespace_nowrap().text_size(T.small).text_color(t.dim).child(place.where)))
        .when(status === "done", (el) => el.child(stateTag(MOD, status, { shape: true, t })))
        .when(needs, (el) => el.child(pulse(stateTag(MOD, status, { shape: true, t }).id("session-state"))))
        .when(working, (el) => el.child(moving("wave") ? pixelWave(t, { id: "session-wave" }) : stateMark(MOD, "working", 12, { t })))
        .when(status === null, (el) => el.child(stateMark(MOD, null, 12, { t })))
        .when(time != null, (el) => el.child(mono(div().flex_none().text_size(T.meta).font_medium().text_color(stateColor(status, t)).child(time))))
        .when(needs && moving("beam"), (el) => el.child(beam(t, { span: this.islandW ?? 320, id: "session-beam" }))));
  }

  // A tab as a pill (a session with 2+ tabs): program icon, name, state shape and timer, close on the
  // active or hovered one. Unnamed tabs say their program, never a bare number.
  tabItem(t, space, shown, c, i) {
    const own = panes().filter((p) => p.tab === c.id);
    const program = own.find((p) => p.program?.agent)?.program ?? own[0]?.program;
    const name = c.named ? c.name : program?.name ?? "Terminal";
    const time = stateTime({ status: c.status, tabs: [c] });
    const reveal = c.active || this.hovTab === c.id;
    return h_flex().id(`tab-${c.id}`).h(H.pill).pl(10).pr(S.xs).gap(S.sm).rounded(H.pill / 2).items_center().flex_none().text_size(T.small).font_medium()
      .when(c.active, (el) => el.bg(t.selected).text_color(t.foreground))
      .when(!c.active, (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .on_hover((h, cx) => {
        if (h ? this.hovTab === c.id : this.hovTab !== c.id) return;
        this.hovTab = h ? c.id : null;
        cx.notify();
      })
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
      .on_mouse_up("left", () => {
        const from = this.pressed; this.pressed = null;
        if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex((x) => x.id === c.id) + 1 });
        else run("tab.select", { id: c.id });
      })
      .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }))
      .when(Boolean(program?.icon), (el) => el.child(program.tint ? svg(program.icon).size(14).flex_none() : image(program.icon).size(14).flex_none()))
      .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
      .when(c.status in RANK && c.status !== "idle", (el) => el.child(stateMark(MOD, c.status, 12, { t })))
      .when(time != null, (el) => el.child(mono(div().flex_none().text_size(T.meta).font_medium().text_color(stateColor(c.status, t)).child(time))))
      .child(div().id(`close-${c.id}`).size(H.pill).flex_none().flex().items_center().justify_center().rounded(R.hit).text_color(t.dim)
        .opacity(reveal ? 1 : 0).transition("opacity", { duration: 120, easing: "ease-out" })
        .hover((s) => s.text_color(t.foreground).bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); if (reveal) run("tab.close", { id: c.id }); })
        .child(svg("mods/workspace-chrome/x.svg").size(12).flex_none()));
  }

  render() {
    const t = theme();
    const width = this.width ?? 727;
    const wide = width >= WIDE;
    const space = spaces().find((p) => p.active);
    const shown = space?.tabs ?? [];
    const lay = layout(), win = window();
    const panel = find(lay, "panel"), body = find(lay, "panel-body");
    // Files and Changes are always offered; PRs and Usage are the layout's own: their toggles exist
    // while the layout has a `prs` / `usage` node.
    const enabled = ["files", "changes", ...["prs", "usage"].filter((id) => find(body, id))];
    const toggles = [
      ["files", "Files", "Files", "mods/files/file.svg"],
      ["changes", "Changes", "Changes", "mods/changes/changes.svg"],
      ["prs", "PRs", "Pull requests", "mods/workspace-chrome/git-compare.svg"],
      ["usage", "Usage", "Usage", "mods/usage/gauge.svg"],
    ].filter(([id]) => enabled.includes(id));
    // On macOS the traffic lights sit over this bar: the layout's `inset` keeps the session clear of them.
    const inset = win?.platform === "macos" ? props()?.inset ?? 10 : 10;
    return h_flex().id("session-bar-root").size_full().min_w(0).pl(inset).pr(10).gap(S.lg).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_size_change((size, cx) => {
        const w = Math.round(size.width);
        const first = this.width === undefined;
        const bucket = (n) => `${n >= WIDE}${n >= WHERE_MIN}`;
        const changed = first || bucket(w) !== bucket(this.width);
        this.width = w;
        if (changed) cx.notify();
      })
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel((e) => { if (shown.length > 1 && Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(shown.length > 1
        ? h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(S.hair).overflow_x_scrollbar().children(shown.map((c, i) => this.tabItem(t, space, shown, c, i)))
        : space ? this.session(t, space, width >= WHERE_MIN) : div().flex_1())
      .child(h_flex().gap(S.sm).flex_none().items_center()
        .child(island({ pl: 3, pr: 3, gap: S.hair, t }).children(toggles.map(([id, label, tip, icon]) => pill({
          id: `panel-${id}`,
          icon,
          label: wide ? label : undefined,
          tip,
          active: Boolean(panel && !panel.hidden && body?.active === id),
          onClick: () => this.togglePanel(id),
          t,
        }))))
        .child(iconButton("tab-new", "mods/workspace-chrome/plus.svg", { size: H.island, radius: R.island, tip: "New session (⌘N)", onClick: () => run("mod.open", { name: "launch" }), t }))
        .when(win?.buttons, (el) => el.child(iconButton("minimize", "mods/workspace-chrome/minus.svg", { onClick: () => run("window.minimize"), t }))
          .child(iconButton("maximize", "mods/workspace-chrome/square.svg", { onClick: () => run("window.maximize"), t }))
          .child(iconButton("close-window", "mods/workspace-chrome/x.svg", { onClick: () => run("window.close"), t }))));
  }
}
