// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/sessions/main.js (copied in by herdr-reload; edit there).
// The sidebar: one list of sessions. A session is a space with one terminal running omp, so the list is
// spaces() in its own order (ctrl+alt+N selects the Nth), under a header per machine.
// Each row is an avatar in the repo's colour carrying omp's icon for the session (the initial when it has
// none; filled for the session you are in, the state as a badge), the session's name (session-names keeps it
// the omp session's: its capital tag dimmed, then the words), what it needs from you, where it works
// (repo · branch) and one time: working since, or how long it has waited. The hovered row shows its shortcut.
// Sub-agents (hc children) nest under their session. The 44 px rail is the same list as avatars alone.
// Draws no agents list of its own: agent.next / agent.prev walk the sessions through setAgentOrder, the ones
// that need you first. The one thing that moves here is a blocked session's badge (it breathes, see
// lib/motion.js pulseBadge); working rows keep their mark.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, machines, agents, terminals, focused, run, theme, shared, setShared, setAgentOrder, openOverlay, window } from "herdr";
import { T, R, H, S, I, W, MONO, PEACH, MAC, shades, weight } from "./lib/tokens.js";
import { RANK, STATES, stateMark, stateColor, stateTime, urgent } from "./lib/state.js";
import { placeOf, nameParts } from "./lib/names.js";
import { avatar, iconButton, stateTag } from "./lib/ui.js";
import { pulseBadge } from "./lib/motion.js";

const MOD = "sessions";
const EXPANDED = 256; // px, the layout's own sidebar width (herdrrc: look sidebar size)
const RAIL = 44;
const FACE = 28; // the avatar, in the list and on the rail

// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

export default class Sessions extends View {
  init(_props, cx) {
    this.folded = new Set();
    this.hov = null; // the row under the pointer: its badge's plate follows the row's hover fill
    // The timers read the clock: a gentle tick is enough, they count minutes.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // What a row says about a space: its name in parts, where its terminal works, the one time worth showing,
  // and what the avatar's initial comes from when omp gave the session no icon.
  info(space, all, now) {
    const place = placeOf(space, all);
    const { icon, tag, text } = nameParts(space.name);
    const initial = place.repo && place.repo !== "~" && place.repo !== "/" ? place.repo : space.name;
    return { space, icon, tag, name: text || space.name, roots: place.roots, where: place.where, time: stateTime(space, now), initial };
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [{ t: k, lines: [...lead, last ? "└" : "├"] }, ...this.tree(all, k.address, [...lead, last ? "" : "│"])];
    });
  }

  subRow(t, s, shown, listed) {
    const k = s.t;
    const status = kidStatus(k, listed);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(48)
      .pr(S.md)
      .rounded(R.row)
      .h(H.sub)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(T.small)
      .when(on, (el) => el.bg(t.raised))
      .when(!on, (el) => el.hover((h) => h.bg(t.hover)))
      .on_click(() => run("terminal.peek", { terminal: k.address }))
      .children(s.lines.map((l) => div().self_start().mt(-4).w(9).h(17).mr(S.xs).flex_none()
        .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(S.sm))))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(stateMark(MOD, RANK[status] ? status : "idle", I.inline, { t }));
  }

  render() {
    const t = theme();
    const sh = shades(t);
    // Collapsed is how wide the sidebar is (the collapse button resizes it); until measured, the shared flag.
    const collapsed = this.narrow ?? shared("sidebar.collapsed") === true;
    const sp = spaces();
    const ag = agents();
    const all = terminals();
    const allPanes = panes();
    const colors = shared("space.colors") ?? {};
    const now = Date.now();
    const listed = new Map(ag.map((a) => [a.address, a.status]));
    const shown = focused()?.agent ?? null;
    const list = sp.map((s, i) => ({ ...this.info(s, allPanes, now), n: i + 1 }));
    const keys = window()?.platform === "macos" ? "⌃⌥" : "Ctrl+Alt+";
    // The rows stay in space order (the numbers are the shortcuts), but agent.next / agent.prev walk
    // whoever needs you first: blocked, then done, working, idle, each in space order.
    setAgentOrder(STATES.flatMap((st) => sp.flatMap((s) => ag.filter((a) => a.space === s.id && a.status === st).map((a) => a.address))));

    // A row's fill under the avatar's badge: rest, hovered or selected, so the badge reads as a ring.
    const plate = (s) => (s.active ? sh.plate.selected : this.hov === s.id ? sh.plate.hover : sh.plate.rest);
    const hover = (id) => (h, cx) => {
      if (h ? this.hov === id : this.hov !== id) return;
      this.hov = h ? id : null;
      cx.notify();
    };
    // A blocked session's badge breathes (the one thing that moves in the list); every other state is still.
    const tile = (x, still) => {
      const s = x.space;
      return avatar({
        mod: MOD, color: colors[s.id] ?? MAC.overlay0, icon: x.icon, initial: x.initial, status: s.status,
        size: FACE, plate: plate(s), still, solid: s.active, t,
        badge: s.status === "blocked" ? pulseBadge({ mod: MOD, status: "blocked", plate: plate(s), id: `badge-${s.id}`, t }) : null,
      });
    };

    // The fold chevron; folded, the count too, coloured by the most urgent sub-agent.
    const fold = (id, subs) => {
      const top = subs.map((s) => kidStatus(s.t, listed)).reduce(urgent, null);
      const open = !this.folded.has(id);
      return div()
        .id(`fold-${id}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(R.hit)
        .text_size(T.meta)
        .text_color(open ? t.dim : stateColor(top, t))
        .hover((el) => el.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          if (open) this.folded.add(id);
          else this.folded.delete(id);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(I.inline).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    const open = (s) => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
    const fill = (el, s) => (s.active ? el.bg(t.selected) : el.hover((h) => h.bg(t.hover)));

    // The rail: the avatar alone, the session in its tooltip.
    const compact = (x) => {
      const s = x.space;
      const name = x.tag ? `${x.tag}: ${x.name}` : x.name;
      return fill(h_flex().id(`sess-${s.id}`).h(38).flex_none().items_center().justify_center().rounded(R.row), s)
        .tooltip(x.where ? `${name} · ${x.where}` : name)
        .on_hover(hover(s.id))
        .on_click(() => run("space.select", { id: s.id }))
        .on_mouse_down("right", () => open(s))
        .child(tile(x, true));
    };

    // A row: the avatar, then the name line (tag, words, fold, time) over the context line (what it needs,
    // where it works, and the shortcut while hovered). Names are 600 for the session you are in and the ones
    // waiting on you, 500 otherwise, muted while idle.
    const row = (x) => {
      const s = x.space;
      const subs = x.roots.flatMap((a) => this.tree(all, a));
      const hot = s.status === "blocked" || s.status === "done";
      const quiet = (s.status === "idle" || s.status === null) && !s.active;
      const color = stateColor(s.status, t);
      const head = fill(h_flex().id(`sess-${s.id}`).pl(S.md).pr(S.md).h(H.session).flex_none().gap(10).items_center().rounded(R.row), s)
        .on_hover(hover(s.id))
        .on_click(() => run("space.select", { id: s.id }))
        .on_mouse_down("right", () => open(s))
        .child(tile(x, false))
        .child(v_flex().flex_1().min_w(0).gap(S.hair)
          .child(h_flex().gap(S.sm).items_center()
            .when(Boolean(x.tag), (el) => el.child(div().flex_none().text_size(T.meta).font_semibold().text_color(s.active ? t.muted : t.dim).child(x.tag)))
            .child(weight(div().flex_1().min_w(0).truncate().text_size(T.body).text_color(quiet ? t.muted : t.foreground), s.active || hot ? W.name : W.label).child(x.name))
            .when(subs.length > 0, (el) => el.child(fold(s.id, subs)))
            .when(x.time != null, (el) => el.child(div().flex_none().font_family(MONO).text_size(T.meta).font_medium().text_color(color).child(x.time))))
          .child(h_flex().gap(S.sm).items_center().text_size(T.meta)
            .when(hot, (el) => el.child(stateTag(MOD, s.status, { t })))
            .child(div().flex_1().min_w(0).overflow_hidden().whitespace_nowrap().text_color(t.dim).child(x.where))
            .when(this.hov === s.id && x.n <= 9, (el) => el.child(div().flex_none().font_family(MONO).text_color(t.dim).child(`${keys}${x.n}`)))));
      if (this.folded.has(s.id) || !subs.length) return [head];
      return [head, ...subs.map((k) => this.subRow(t, k, shown, listed))];
    };

    // A header per machine, in spaces()' order: this Mac first, then the others by name. This Mac's label is
    // muted, another machine's peach with its link state: a green dot while connected, the word otherwise.
    const known = machines();
    const layoutOf = (m) => known.find((k) => (k.name ?? null) === m)?.layout;
    const names = [null, ...[...new Set([...known.map((m) => m.name), ...sp.map((s) => s.machine)].filter(Boolean))].sort()];
    const header = (m, count, first) => {
      const layout = layoutOf(m);
      const color = m ? PEACH : t.muted;
      const word = m && layout === "loading" ? "connecting…" : m && layout === "unavailable" ? "offline" : null;
      const icon = svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(collapsed ? 12 : 13).flex_none().text_color(collapsed ? (m ? PEACH : t.dim) : color);
      if (collapsed) {
        return h_flex().id(`machine-${m ?? "local"}`).h(24).mt(first ? 0 : S.sm).flex_none().items_center().justify_center().tooltip(m ?? "This Mac").child(icon);
      }
      return h_flex()
        .id(`machine-${m ?? "local"}`)
        .h(28)
        .mt(first ? 0 : S.lg)
        .px(S.md)
        .flex_none()
        .gap(S.sm)
        .items_center()
        .text_size(T.meta)
        .font_semibold()
        .text_color(color)
        .child(icon)
        .child(div().flex_1().min_w(0).truncate().child(m ?? "This Mac"))
        .when(Boolean(word), (el) => el.child(div().flex_none().font_normal().text_color(t.dim).child(word)))
        .when(!word && count > 0, (el) => el.child(div().flex_none().font_family(MONO).font_normal().text_color(t.dim).child(String(count))))
        .when(Boolean(m) && !word, (el) => el.child(div().size(S.sm).flex_none().rounded(3).bg(layout === "ready" ? t.done : t.dim)));
    };
    const note = (m, loading) => collapsed ? [] : [div().id(`none-${m ?? "local"}`).h(28).pl(31).flex_none().flex().items_center().text_size(T.meta).text_color(t.dim).child(loading ? "Loading…" : "No sessions")];
    const rows = names.flatMap((m, i) => {
      const mine = list.filter((x) => (x.space.machine ?? null) === m);
      const body = mine.length ? mine.flatMap((x) => (collapsed ? [compact(x)] : row(x))) : note(m, layoutOf(m) === "loading");
      return [header(m, mine.length, i === 0), ...body];
    });

    return v_flex()
      .id("sessions-root")
      .on_size_change((size, cx) => {
        const narrow = size.width < 120;
        if (narrow === this.narrow) return;
        this.narrow = narrow;
        cx.notify();
      })
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .text_size(T.body)
      .when(!collapsed, (el) => el.child(h_flex().h(36).pl(S.xl).pr(S.md).flex_none().items_center().justify_between()
        .child(weight(div().text_size(T.small).text_color(t.muted), W.name).child("Sessions"))
        .child(iconButton("sess-new", "mods/workspace-chrome/plus.svg", {
          tip: "New session (⌘N)",
          onClick: () => run("mod.open", { name: "launch" }),
          t,
        }))))
      .when(sp.length === 0 && !collapsed, (el) => el.child(div().px(S.xl).py(S.sm).text_size(T.small).text_color(t.dim).child("No sessions yet. Press ⌘N to start omp in a folder.")))
      .child(v_flex().id("sess-list").flex_1().min_h(0).px(collapsed ? S.xs : S.md).pt(S.xs).pb(S.md).gap(S.hair).overflow_y_scrollbar().mode("always").children(rows))
      .child(h_flex().h(32).flex_none().px(collapsed ? 0 : S.md).items_center().when(collapsed, (el) => el.justify_center()).when(!collapsed, (el) => el.justify_end())
        .child(iconButton("collapse", `mods/workspace-chrome/chevron-${collapsed ? "right" : "left"}.svg`, {
          tip: collapsed ? "Expand sessions" : "Collapse sessions",
          color: t.dim,
          onClick: () => {
            const next = !collapsed;
            setShared("sidebar.collapsed", next);
            run("layout.resize", { id: "sidebar", px: next ? RAIL : EXPANDED });
          },
          t,
        })));
  }
}
