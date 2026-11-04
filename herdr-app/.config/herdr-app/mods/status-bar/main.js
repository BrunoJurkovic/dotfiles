// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/status-bar (copied in by herdr-reload; edit there).
// The 26 px status bar, in priority order from the left (the toasts cover the right ~55 %, so what you must
// act on lives on the left):
//   1  the attention tally: `3 needs you`, `1 finished` (nothing when zero); a click goes to the first one
//   2  the machine chips: this Mac's, then each other machine's health and load · mem · disk
//   3  the omp usage chip (mods/usage draws it; shared("omp.chip"))
//   4  the palette hint
// Which session you are in (machine, branch, state) is the session bar's job, the agent count the sidebar's.
// On narrow bars the lowest priorities give way: the hint below 800 px, mem and disk (unless they are
// warning or critical) below 900 px.
import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, theme, run, window, machines, exec, layout, shared } from "herdr";
import { T, R, H, S, MONO, PEACH, W, weight } from "./lib/tokens.js";
import { stateTag } from "./lib/ui.js";

const MOD = "status-bar";
const HINT_MIN = 800; // bar width from which the palette hint shows
const FULL_MIN = 900; // bar width from which a machine chip shows mem and disk always

// Every CHECK_MS an exec reads load (against the core count), memory in use and the fullest of / and home
// (df -P). On Linux memory in use is MemAvailable against MemTotal; on macOS it is Activity Monitor's
// "Memory Used" (app memory + wired + compressed) against physical memory. Remote machines: reachability
// comes from machines()[].layout, and an unreachable machine isn't polled: the next look comes RETRY_MS
// after a failed one (backing off to RETRY_MAX_MS), or as soon as its layout is ready again. This Mac is
// always there. Amber: load > cores, mem > 80%, disk > 80%. Red: unreachable, mem or disk > 90%,
// load > 2 × cores.
const TICK_MS = 5000;
const CHECK_MS = 30000;
const RETRY_MS = 60000;
const RETRY_MAX_MS = 300000;
const WARN = 80;
const CRIT = 90;
const DISK = `df -P / "$HOME" | awk 'NR>1{print "disk", $5}'`;
const LINUX_STATS = [
  'echo "load $(cut -d" " -f1 /proc/loadavg)"',
  'echo "cores $(nproc)"',
  `awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{print "mem", t, a}' /proc/meminfo`,
  DISK,
].join("; ");
// vm_stat in pages; "mem <total> <available>" like Linux's, available = total - used.
const MAC_STATS = [
  `sysctl -n vm.loadavg | awk '{print "load", $2}'`,
  'echo "cores $(sysctl -n hw.ncpu)"',
  `vm_stat | awk -v bytes="$(sysctl -n hw.memsize)" '/page size of/{ps=$8} /^Anonymous pages/{a=$3} /^Pages purgeable/{p=$3} /^Pages wired down/{w=$4} /^Pages occupied by compressor/{c=$5} END{t=int(bytes/ps); print "mem", t, t-(a-p+w+c)}'`,
  DISK,
].join("; ");
const HERE = "";
const label = (name) => name || "This Mac";

function parseStats(text) {
  const s = { load: null, cores: null, mem: null, disk: null };
  for (const line of text.split("\n")) {
    const [key, a, b] = line.trim().split(/\s+/);
    if (key === "load") s.load = parseFloat(a);
    else if (key === "cores") s.cores = parseInt(a, 10);
    else if (key === "mem" && Number(a) > 0) s.mem = Math.round(100 * (1 - Number(b) / Number(a)));
    else if (key === "disk") s.disk = Math.max(s.disk ?? 0, parseInt(a, 10));
  }
  for (const k of Object.keys(s)) if (!Number.isFinite(s[k])) s[k] = null;
  return s;
}

// omp usage: a click on the chip opens the panel on Usage (or closes it again).

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function toggleUsage() {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  if (!panel || !find(body, "usage")) return;
  if (!panel.hidden && body.active === "usage") run("layout.hide", { id: "panel" });
  else { run("layout.select", { stack: "panel-body", child: "usage" }); run("layout.show", { id: "panel" }); }
}

const mono = (el) => el.font_family(MONO);

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    // name ("" for this Mac) -> { layout, ok, stats, failures, next, busy }
    this.hosts = {};
    cx.timer.every(TICK_MS, (cx) => this.tick(cx));
    this.tick(cx);
  }

  tick(cx) {
    const now = Date.now();
    let changed = false;
    const live = new Set();
    for (const m of machines()) {
      const name = m.name ?? HERE;
      // This Mac has no layout to wait for.
      const layout = name === HERE ? "ready" : m.layout;
      live.add(name);
      const r = (this.hosts[name] ??= { layout, ok: null, stats: null, failures: 0, next: 0, busy: false });
      // Back after being away: look at once, whatever the retry delay was.
      if (layout === "ready" && r.layout !== "ready") r.next = 0;
      if (r.layout !== layout) changed = true;
      r.layout = layout;
      if (layout !== "ready") {
        // The layout says it's unreachable (or still connecting): nothing to ask.
        if (r.ok !== null) changed = true;
        r.ok = null;
        r.stats = null;
      } else if (!r.busy && now >= r.next) {
        r.busy = true;
        this.check(cx, name, r);
      }
    }
    for (const name of Object.keys(this.hosts)) {
      if (!live.has(name)) {
        delete this.hosts[name];
        changed = true;
      }
    }
    if (changed) cx.notify();
  }

  check(cx, name, r) {
    const local = name === HERE;
    const script = local && window()?.platform === "macos" ? MAC_STATS : LINUX_STATS;
    cx.spawn(async (cx) => {
      try {
        const res = await exec("sh", ["-c", script], local ? {} : { on: name });
        const stats = res.code === 0 ? parseStats(res.stdout) : null;
        r.ok = stats !== null;
        r.stats = stats;
      } catch (_) {
        r.ok = false;
        r.stats = null;
      }
      r.failures = r.ok ? 0 : r.failures + 1;
      r.next = Date.now() + (r.ok ? CHECK_MS : Math.min(RETRY_MS * 2 ** (r.failures - 1), RETRY_MAX_MS));
      r.busy = false;
      cx.notify();
    });
  }

  // What needs you (blocked) or finished while you looked elsewhere: the state's shape and a count in its
  // colour; a click goes to the first of them (agent.focus, not agent.next: the sidebar walks space order).
  tally(t, list, status, label) {
    const hits = list.filter((a) => a.status === status);
    if (!hits.length) return null;
    return h_flex().id(`tally-${status}`).h(H.chip).px(S.xs).flex_none().items_center().rounded(R.hit)
      .hover((s) => s.bg(t.hover))
      .tooltip(`Go to the first session that ${status === "blocked" ? "needs you" : "finished"}`)
      .on_click(() => run("agent.focus", { terminal: hits[0].address }))
      .child(stateTag(MOD, status, { shape: true, label: `${hits.length} ${label}`, t }).text_size(T.small));
  }

  // One compact chip per machine: "● froggybox · load 0.4 · mem 23% · disk 41%". This Mac's name is muted,
  // another machine's peach. The dot is the worst of its metrics. `full` = every metric; otherwise load,
  // and mem / disk only while warning.
  machine(name, r, t, full) {
    const amber = t.ansi3;
    const red = t.blocked;
    const sep = () => div().text_color(t.dim).child("·");
    const row = h_flex().id(`machine-${name || "local"}`).flex_none().gap(S.sm).items_center().whitespace_nowrap();
    const dot = (color) => div().size(6).flex_none().rounded(3).bg(color);
    const head = weight(div().text_color(name ? PEACH : t.muted), W.label).child(label(name));
    const lead = (color, text) => row.child(dot(color)).child(head).child(sep()).child(div().text_size(T.meta).text_color(color).child(text));

    if (r.layout === "loading") return lead(t.dim, "connecting");
    if (r.layout !== "ready" || r.ok === false) return lead(red, "unreachable");
    if (!r.stats) return lead(t.dim, "checking");

    const { load, cores, mem, disk } = r.stats;
    const metrics = [];
    if (load !== null) {
      const level = cores && load > 2 * cores ? red : cores && load > cores ? amber : null;
      metrics.push({ key: "load", text: "load " + (load < 10 ? load.toFixed(1) : Math.round(load)), level });
    }
    if (mem !== null) metrics.push({ key: "mem", text: `mem ${mem}%`, level: mem > CRIT ? red : mem > WARN ? amber : null });
    if (disk !== null) metrics.push({ key: "disk", text: `disk ${disk}%`, level: disk > CRIT ? red : disk > WARN ? amber : null });
    const worst = metrics.some((m) => m.level === red) ? red : metrics.some((m) => m.level === amber) ? amber : t.done;
    row.tooltip(`${label(name)}: ${metrics.map((m) => m.text).join(" · ")}`).child(dot(worst)).child(head);
    const shown = full ? metrics : metrics.filter((m) => m.key === "load" || m.level);
    for (const m of shown) row.child(sep()).child(mono(div().text_size(T.meta).text_color(m.level ?? t.dim).child(m.text)));
    return row;
  }

  // The omp usage chip: mods/usage draws it (an SVG) when the limits arrive and leaves its path in
  // shared("omp.chip") as { file, w, h } (and optionally a `tip`); one pill here, a small read per render.
  usageChip(t) {
    const chip = shared("omp.chip");
    if (!chip?.file) return null;
    return h_flex().id("usage-chip").h(H.pill).px(S.sm).flex_none().items_center().rounded(H.pill / 2)
      .hover((s) => s.bg(t.hover))
      .tooltip(chip.tip ?? "Usage limits per account. Click to open.")
      .on_click(() => toggleUsage())
      .child(image(chip.file).w(chip.w).h(chip.h).flex_none());
  }

  render() {
    const t = theme();
    const width = this.width ?? 727;
    const list = agents();
    const known = machines().map((m) => m.name ?? HERE).filter((name) => this.hosts[name]).sort((a, b) => (a === HERE ? -1 : b === HERE ? 1 : a.localeCompare(b)));
    const usage = this.usageChip(t);
    const tally = [this.tally(t, list, "blocked", "needs you"), this.tally(t, list, "done", "finished")].filter(Boolean);
    return h_flex().id("status-root").size_full().min_w(0).overflow_hidden().pl(S.md).pr(S.lg).gap(S.lg).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(T.small).text_color(t.muted)
      .on_size_change((size, cx) => {
        const w = Math.round(size.width);
        const bucket = (n) => `${n >= HINT_MIN}${n >= FULL_MIN}`;
        const changed = this.width === undefined || bucket(w) !== bucket(this.width);
        this.width = w;
        if (changed) cx.notify();
      })
      .when(tally.length > 0, (el) => el.child(h_flex().flex_none().items_center().gap(S.xs).children(tally)))
      .when(known.length > 0, (el) => el.child(h_flex().flex_shrink(1).min_w(0).overflow_hidden().items_center().gap(S.lg)
        .children(known.map((name) => this.machine(name, this.hosts[name], t, width >= FULL_MIN)))))
      .child(div().flex_1())
      .when(Boolean(usage), (el) => el.child(usage))
      .when(width >= HINT_MIN, (el) => el.child(mono(h_flex().id("palette").h(H.chip).px(S.sm).flex_none().items_center().rounded(R.hit).text_size(T.meta).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Command palette")
        .on_click(() => run("app.palette")))
        .child(window()?.platform === "macos" ? "⌘⇧P" : "Ctrl+Shift+P")));
  }
}
