// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/usage (copied in by herdr-reload; edit there).
// Usage, at a glance: how much of each account's limits is spent (a block per account, in omp's priority
// order) and what omp has cost (today, 7 days, 30 days, all time) on this Mac and every machine. With
// props { role: "fetch" } this is the headless copy the layout docks in its floating list: it draws nothing
// and keeps the answers fresh, so the panel (and the status bar's chip) have data before the panel was
// ever opened.
//
// The panel is a card like Files and PRs (lib/ui.js): a 40 px header (title, how fresh it is or a stale
// chip, refresh) over a body that is ONE image. Every native element costs Herdr ~0.6 ms to build and a
// render happens on any change, so art.js draws the body as SVG, data.js has macOS's JavaScriptCore shell
// run it (render.mjs: in Herdr's own JS it took seconds and the task was cut off) and writes it to
// data/usage/, and this view redraws it only when the answers, the range, the width or the five-minute
// bucket change. A render is the header, the image at its own size and a few transparent hit areas over the
// range picker, the `+N more` links and the per-account tooltips. While the first answers are on their way
// the body is skeleton blocks (lib/motion.js); the only other thing that moves is the refresh arrow, while a
// refresh Bruno asked for runs. Background fetches are silent.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { layout, theme, shared, setShared, props, exec, spaces, panes } from "herdr";
import { T, S, H, I, R, MAC } from "./lib/tokens.js";
import { chip, card, iconButton, sectionHeader } from "./lib/ui.js";
import { skeleton } from "./lib/motion.js";
import { repoOf } from "./lib/names.js";
import { tick, release, requestRefresh, busy, fetchState, usage, stats, machineList, drawPanel, pruneArt, artExists, ensureChip } from "./data.js";
import { RANGES, ago, staleText } from "./fmt.js";

const icon = (name) => `mods/usage/${name}.svg`;
// A draw that hasn't come back by then (jsc's 30 s exec limit, then the write) frees the slot for the next.
const DRAW_MS = 45000;
// The theme roles the picture is drawn with.
const ROLES = ["foreground", "muted", "dim", "background", "raised", "border", "hover", "selected", "accent", "blocked", "done", "working", "chrome"];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// What shows: the panel open with this child selected. No layout (herdr-app check) counts as shown.
function shown() {
  const root = layout();
  if (!root) return true;
  const panel = find(root, "panel"), body = find(root, "panel-body");
  return Boolean(panel && !panel.hidden && body?.active === "usage");
}

// The picture is drawn at the panel's own width (to 8 px, so a drag redraws rarely), 280 to 1000. It shows
// at its own size, so the few px of difference are air at the right edge.
const designWidth = (w) => Math.max(280, Math.min(1000, Math.floor((Math.round(w) - 2) / 8) * 8));

// What the picture is made of, as a short string: a fetch that brought the same numbers draws nothing new.
function fingerprint(d, s) {
  const limits = (d?.providers ?? []).map((p) => p.accounts.map((a) => `${a.key}/${a.title}/${a.priority}/${a.windows.map((w) => `${w.key}=${w.f}@${w.reset ?? ""}`).join(",")}`).join(";")).join("|");
  const spend = Object.entries(s?.machines ?? {}).map(([k, m]) => {
    const r = m.ranges;
    return `${k}:${m.error?.message ?? ""}:${r ? `${r.today.o.cost}/${r.d7.o.req}/${r.d30.o.req}/${r.all.o.req}/${m.hours?.at(-1)?.[1]}` : ""}`;
  }).join("|");
  return `${d?.error ? d.at : ""}${d?.error?.message ?? ""}§${limits}§${spend}`;
}

export default class Usage extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "panel";
    this.id = Math.random().toString(36).slice(2, 8);
    this.size = { width: 336, height: 700 };
    this.art = null;  // the drawn panel: { file, w, h, hits }
    this.key = "";    // what it was drawn from
    this.drawing = 0; // when the draw in flight started
    this.drawError = null; // why the last draw failed, while there is no picture to keep
    this.more = {};   // which ranked lists show everything
    // Every copy runs the same loop; the first to find a fetch due takes the lock (data.js).
    cx.timer.every(5000, (cx) => { tick(cx, this.id); });
    tick(cx, this.id);
    if (this.role === "fetch") {
      // The chip's files can go missing (a cleaned data folder); the headless copy is always there to notice.
      const heal = (cx) => { cx.spawn(async () => { await ensureChip(); }); };
      heal(cx);
      cx.timer.every(60000, heal);
    } else {
      // The relative times ("updated 2m ago", "resets in 2h 14m") move: redraw while the panel shows, and
      // make sure the picture it points at is still on disk. A failed draw is tried again here.
      cx.timer.every(60000, (cx) => {
        if (!shown()) return;
        const file = this.art?.file;
        if (file) cx.spawn(async (cx) => { if (!(await artExists(file)) && this.art?.file === file) { this.key = ""; cx.notify(); } });
        if (this.drawError) this.key = "";
        cx.notify();
      });
    }
  }

  async close() {
    release(this.id);
  }

  // Repo name → the colour of the space that works in it (the same dot the sessions list shows).
  repoColors() {
    const colors = shared("space.colors") ?? {}, all = panes(), out = {};
    for (const space of spaces()) if (colors[space.id]) out[repoOf(space, all)] ??= colors[space.id];
    return out;
  }

  // Draws the panel for these inputs (data.js drawPanel: jsc draws, the file is written) and shows it. In a
  // task, never inside render, which is cut off after a short time; an exec first, so the task really starts
  // after render returned. A failure keeps the old picture, or says why when there is none.
  draw(cx, key, t, W, range, now) {
    const roles = Object.fromEntries(ROLES.map((r) => [r, t[r]]));
    const more = { ...this.more };
    this.key = key;
    this.drawing = now;
    cx.spawn(async (cx) => {
      let file = null;
      try {
        await exec("true", []);
        const s = stats();
        this.art = await drawPanel({ t: roles, W, now, range, more, repoColors: this.repoColors(), d: usage(), s, list: machineList(s) });
        file = this.art.file;
        this.drawError = null;
      } catch (e) {
        this.drawError = String(e?.message ?? e);
      } finally {
        this.drawing = 0;
        cx.notify();
      }
      if (file) await pruneArt("panel", [file]);
    });
  }

  // Which sources are showing old data, and why: { text, tip } for the header's chip, or null.
  stale(d, s, now) {
    const bad = [];
    if (d?.error && d.at) bad.push({ at: d.at, why: `Limits: ${d.error.message}` });
    for (const [key, m] of Object.entries(s?.machines ?? {})) {
      if (m.error && m.at) bad.push({ at: m.at, why: `${key === "local" ? "This Mac" : key}: ${m.error.message}` });
    }
    return bad.length ? { text: staleText(Math.min(...bad.map((b) => b.at)), now), tip: bad.map((b) => b.why).join("\n") } : null;
  }

  // The first answers are on their way: the body's own shape as skeleton blocks (lib/motion.js, shimmering:
  // the one moving thing here; the refresh arrow waits still).
  skeleton(t) {
    const sk = (id, o) => skeleton(t, { id: `usage-sk-${id}`, ...o });
    const win = (i) => h_flex().h(38).flex_none().items_start().gap(S.lg).pt(S.xs)
      .child(sk(`w${i}a`, { w: 28, h: 12, radius: 4 })).child(sk(`w${i}b`, { w: "fill", h: 6, radius: 3 }).mt(S.sm)).child(sk(`w${i}c`, { w: 32, h: 12, radius: 4 }));
    return v_flex().id("usage-loading").px(S.xl).pt(S.xs).pb(S.xl)
      .child(sectionHeader("Limits", { t }))
      .child(h_flex().h(28).flex_none().items_center().justify_between().child(sk("pn", { w: 96, h: 14, radius: 4 })).child(sk("pc", { w: 72, h: H.chip, radius: H.chip / 2 })))
      .child(win(0)).child(win(1)).child(win(2))
      .child(div().h(S.xl).flex_none())
      .child(div().h(1).flex_none().bg(t.border))
      .child(sectionHeader("Spend", { t }).mt(S.xs))
      .child(sk("seg", { h: 26, radius: H.island / 2 }))
      .child(div().h(S.lg).flex_none())
      .child(sk("sum", { w: 180, h: 14, radius: 4 }))
      .child(div().h(S.xl).flex_none())
      .child(sk("strip", { h: 64, radius: R.row }))
      .child(div().h(S.xl).flex_none())
      .child(sk("facts", { h: 40, radius: R.row }));
  }

  // Nothing to show and nothing on its way: say why, in the empty-state recipe.
  failure(t, title, why) {
    return v_flex().flex_1().items_center().justify_center().gap(S.sm).px(S.xxl).pb(S.xxl)
      .child(svg(icon("gauge")).size(I.empty).flex_none().text_color(t.dim))
      .child(div().text_size(T.body).font_semibold().text_color(t.muted).child(title))
      .child(div().max_w(260).text_size(T.small).text_color(t.dim).text_center().child(why))
      .child(div().max_w(260).text_size(T.small).text_color(t.dim).text_center().child("It tries again in a minute, or use refresh."));
  }

  // A transparent area over the picture: a range pill, a `+N more` link, or a tooltip over an account's block.
  hit(h, t) {
    const el = div().id(`usage-${h.kind}-${h.id}`).absolute().left(Math.round(h.x)).top(Math.round(h.y)).w(Math.round(h.w)).h(Math.round(h.h));
    if (h.kind === "tip") return el.tooltip(h.tip);
    if (h.kind === "range") return el.rounded(H.pill / 2).hover((st) => st.bg(t.hover)).on_click((_e, cx) => { setShared("omp.range", h.id); cx.notify(); });
    return el.rounded(R.hit).hover((st) => st.bg(t.hover)).on_click((_e, cx) => { this.more = { ...this.more, [h.id]: !this.more[h.id] }; cx.notify(); });
  }

  render(cx) {
    if (this.role === "fetch") return div();
    const t = theme();
    const f = fetchState();
    const now = Date.now();
    const d = usage(), s = stats();
    const loaded = Boolean(d?.at) || machineList(s).length > 0;
    const running = Boolean(busy(now, f));
    const loading = !loaded && (running || !f.usage.tried || !f.stats.tried);

    // Draw only while the panel shows (reading the spaces for the repo dots happens in the task, not here).
    if (loaded && shown()) {
      const asked = shared("omp.range");
      const range = RANGES.some(([k]) => k === asked) ? asked : "today";
      const W = designWidth(this.size.width);
      const key = [fingerprint(d, s), range, Math.floor(now / 300000), W, ROLES.map((r) => t[r]).join(""), this.more.models ? 1 : 0, this.more.repos ? 1 : 0].join("|");
      if (key !== this.key && !(this.drawing && now - this.drawing < DRAW_MS)) this.draw(cx, key, t, W, range, now);
    }

    // Header: the title, one freshness (updated, or the stale chip when a fetch failed), refresh.
    const stale = loaded ? this.stale(d, s, now) : null;
    const newest = Math.max(f.usage.at ?? 0, f.stats.at ?? 0);
    // Only a refresh Bruno asked for moves anything: the arrow turns while it runs over data already on
    // screen. The background fetches (every two minutes, up to 40 s on a slow machine) stay silent.
    const asked = f.req > Math.min(f.usage.tried, f.stats.tried);
    const turning = running && asked && !loading;
    const freshness = turning ? "refreshing…" : loaded && !stale && newest ? `updated ${ago(newest, now)}` : "";
    const arrow = svg(icon("refresh")).size(I.row).flex_none().when(turning, (el) => el.spin(900));
    const refresh = iconButton("usage-refresh", arrow, {
      tip: "Refresh limits and spend", color: turning ? t.working : undefined, t,
      onClick: (_e, cx) => { if (this.drawError) this.key = ""; requestRefresh(cx, this.id); cx.notify(); },
    });
    const header = h_flex().h(H.panel).flex_none().px(S.xl).gap(S.md).items_center().border_b(1).border_color(t.border)
      .child(div().text_size(T.body).font_semibold().child("Usage"))
      .child(div().flex_1().min_w(0).truncate().text_right().text_size(T.meta).text_color(t.dim).child(freshness))
      .when(Boolean(stale), (el) => el.child(div().flex_none().tooltip(stale.tip).child(chip(stale.text, MAC.yellow, t))))
      .child(refresh);

    // The picture shows at its own size, never scaled: an old one (the panel was resized, a new one is on its
    // way) is cropped or has air beside it, and scaling it up past the texture limit left the body blank.
    // Until the first picture is written the body is the skeleton, or why it couldn't be drawn.
    let body;
    const a = this.art;
    if (loading) body = this.skeleton(t);
    else if (!loaded) {
      const why = d?.error?.message ?? Object.values(s?.machines ?? {}).map((m) => m.error?.message).find(Boolean) ?? "No answer.";
      body = this.failure(t, "Couldn't read usage", why);
    } else if (a) {
      body = div().relative().w(a.w).h(a.h).flex_none()
        .child(image(a.file).w(a.w).h(a.h))
        .children(a.hits.map((h) => this.hit(h, t)));
    } else if (this.drawError) body = this.failure(t, "Couldn't draw usage", this.drawError);
    else body = this.skeleton(t);

    return card(t).id("usage").size_full().min_h(0).text_color(t.foreground).text_size(T.body)
      .on_size_change((size, cx) => {
        const changed = Math.round(size.width) !== Math.round(this.size.width);
        this.size = size;
        if (changed) cx.notify();
      })
      .child(header)
      .child(v_flex().id("usage-body").flex_1().min_h(0).overflow_y_scrollbar().child(body));
  }
}
