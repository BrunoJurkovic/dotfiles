// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/launch (copied in by herdr-reload; edit there).
// The launcher (cmd-n, ctrl-alt-a and every + button, `mod.open:launch`): start omp in a folder, on this Mac or
// another machine, with no prompt asked first. Always a NEW space (a session) running omp there, even when the
// folder already has one; the space stays unnamed, session-names names it after omp's session.
//
//   Recent    the last six folders omp sessions were started in, on every machine, newest first: a tile each
//             with omp's icon and title for the latest session there, the machine and how long ago
//   Folders   on the machine picked beside the search (the focused session's at first): recent session
//             folders, zoxide's, ~/Development's; type to filter, or type a path (/… or ~/…) to open any
//             folder; Browse… picks one in Finder (this Mac)
//
// Keys: arrows move through the tiles and the list, ↵ starts omp, ⇧↵ (or a shift-click) a shell instead,
// tab switches the machine, esc closes. What each machine has is read in one exec (READ below) every time
// the launcher opens and kept in localStorage, so it opens with the last answer at once.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, theme, spaces, panes, machines, focused, exec, home, appHome, readTextFile, pickFolder, window } from "herdr";
import { T, R, H, S, I, W, MONO, PEACH, accentFor, shades, tint, weight } from "./lib/tokens.js";
import { nameParts, colorKey } from "./lib/names.js";
import { avatar, chip, rowFill } from "./lib/ui.js";
import { skeleton } from "./lib/motion.js";
import { ago } from "./lib/time.js";

const MOD = "launch";
const AGENT = ["omp"];
const RECENT = 6; // tiles, three to a row
const VISIBLE = 6; // list rows shown at once
const TILE_H = 76;
const SEG = { box: 26, item: 20 }; // the machine picker: an island-style box holding pill segments

// Per machine, one JSON answer: its home, the folders omp sessions were started in (newest first, with the
// latest session's title), zoxide's folders by rank, and ~/Development's. Temp folders don't count as places
// to come back to, and a folder that is gone is left out.
const READ = String.raw`
import glob, json, os, shutil, subprocess
home = os.path.expanduser("~")
skip = ("/tmp", "/private/tmp", "/private/var/", "/var/folders/")
def keep(p):
    return bool(p) and p != "/" and not p.startswith(skip) and os.path.isdir(p)
files = []
for f in glob.glob(os.path.join(home, ".omp/agent/sessions/*/*.jsonl")):
    try: files.append((os.path.getmtime(f), f))
    except OSError: pass
files.sort(reverse=True)
seen, recent = set(), []
for at, f in files:
    title, cwd = "", None
    try:
        with open(f, "rb") as fh:
            for _ in range(3):
                line = fh.readline()
                if not line: break
                try: o = json.loads(line)
                except ValueError: continue
                if o.get("type") == "title": title = (o.get("title") or "").strip()
                elif o.get("type") == "session": cwd = o.get("cwd")
    except OSError: continue
    if not cwd or cwd in seen: continue
    seen.add(cwd)
    if keep(cwd): recent.append({"path": cwd, "at": int(at * 1000), "title": title})
    if len(recent) >= 40: break
z = []
zx = shutil.which("zoxide")
if zx:
    try:
        out = subprocess.run([zx, "query", "-l"], capture_output=True, text=True, timeout=5).stdout
        z = [p for p in out.split("\n")[:120] if keep(p)][:80]
    except Exception: pass
dev = []
d = os.path.join(home, "Development")
try: dev = sorted(os.path.join(d, n) for n in os.listdir(d) if not n.startswith(".") and os.path.isdir(os.path.join(d, n)))
except OSError: pass
print(json.dumps({"home": home, "recent": recent, "z": z, "dev": dev}))
`;

const key = (m) => m ?? "";
const label = (m) => m ?? "This Mac";
const base = (path) => path.replace(/\/+$/, "").split("/").pop() || path;
const tilde = (path, h) => (h && path === h ? "~" : h && path.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path);
const mono = (el) => el.font_family(MONO);
const machineIcon = (m) => `mods/workspace-chrome/${m ? "server" : "monitor"}.svg`;

export default class Launch extends View {
  init(_props, cx) {
    const here = spaces().find((s) => s.id === focused()?.space) ?? spaces().find((s) => s.active);
    const names = machines().map((m) => m.name ?? null);
    this.machine = names.includes(here?.machine ?? null) ? (here?.machine ?? null) : null;
    try { this.data = JSON.parse(localStorage.getItem("data") ?? "{}"); } catch { this.data = {}; }
    this.loading = new Set();
    this.failed = {}; // machine key -> why its read failed
    this.pins = {};
    this.query = "";
    this.zone = "grid"; // where the cursor is: the recent tiles or the folder list
    this.gi = 0;
    this.at = 0;
    this.start0 = 0;
    this.wheel = 0;
    this.busy = false;
    this.error = "";

    this.input = InputState.new({ placeholder: "Search folders, or type a path" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.zone = this.query.trim() ? "list" : "grid";
      this.at = 0;
      this.start0 = 0;
      this.error = "";
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.open(false, cx));
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());

    for (const m of machines()) if (!m.name || m.layout === "ready") this.load(m.name ?? null, cx);
    cx.spawn(async (cx) => {
      try {
        const raw = JSON.parse((await readTextFile(`${appHome()}/space-colors.json`)) ?? "{}");
        this.pins = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
      } catch {}
      cx.notify();
    });
  }

  // One machine's folders (READ), kept for the next time the launcher opens.
  load(m, cx) {
    const k = key(m);
    this.loading.add(k);
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-c", READ], m ? { on: m } : {});
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.code}`);
        const d = JSON.parse(r.stdout);
        this.data[k] = { at: Date.now(), home: d.home, recent: d.recent ?? [], z: d.z ?? [], dev: d.dev ?? [] };
        delete this.failed[k];
        localStorage.setItem("data", JSON.stringify(this.data));
      } catch (error) {
        this.failed[k] = String(error?.message ?? error);
      }
      this.loading.delete(k);
      cx.notify();
    });
  }

  homeOf(m) {
    return this.data[key(m)]?.home ?? (m ? null : home());
  }

  colorOf(path) {
    const k = colorKey(path);
    return this.pins[k] ?? accentFor(k);
  }

  // The newest folders across machines that are still known: { machine, path, at, title }.
  recent() {
    const known = new Set(machines().map((m) => key(m.name ?? null)));
    const all = [];
    for (const [k, d] of Object.entries(this.data)) {
      if (!known.has(k)) continue;
      for (const r of d.recent ?? []) all.push({ machine: k || null, ...r });
    }
    return all.sort((a, b) => b.at - a.at).slice(0, RECENT);
  }

  // The folders to pick on a machine, best first: recent session folders, zoxide's, ~/Development's. A path
  // typed in comes first, as is.
  entries(m) {
    const d = this.data[key(m)];
    const out = new Map();
    const add = (path, extra = {}) => { if (path && !out.has(path)) out.set(path, { path, name: base(path), ...extra }); };
    for (const r of d?.recent ?? []) add(r.path, { title: r.title, at: r.at });
    for (const p of d?.z ?? []) add(p);
    for (const p of d?.dev ?? []) add(p);
    return [...out.values()];
  }

  // A typed path, made absolute against the machine's home: null when the query isn't one.
  typed(m) {
    const q = this.query.trim();
    if (!q.startsWith("/") && !q.startsWith("~")) return null;
    const h = this.homeOf(m);
    if (q.startsWith("~") && !h) return null;
    const path = (q === "~" ? h : q.startsWith("~/") ? `${h}/${q.slice(2)}` : q).replace(/\/+$/, "") || "/";
    return { path, name: base(path), typed: true };
  }

  // Entries matching every word typed, the best name match first; a typed path on top.
  shown(m) {
    const all = this.entries(m);
    const typed = this.typed(m);
    const words = typed ? [] : this.query.toLowerCase().split(/\s+/).filter(Boolean);
    let list = all;
    if (words.length) {
      const h = this.homeOf(m);
      const rank = (e) => {
        const n = e.name.toLowerCase();
        return n === words[0] ? 0 : n.startsWith(words[0]) ? 1 : n.includes(words[0]) ? 2 : 3;
      };
      list = all
        .map((e, i) => ({ e, i, hay: `${e.name} ${tilde(e.path, h)}`.toLowerCase() }))
        .filter((x) => words.every((w) => x.hay.includes(w)))
        .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
        .map((x) => x.e);
    } else if (typed) {
      list = all.filter((e) => e.path.startsWith(typed.path) && e.path !== typed.path);
    }
    return typed ? [typed, ...list] : list;
  }

  close() {
    closeOverlay(props().overlay);
  }

  pickMachine(m) {
    if (m === this.machine) return;
    this.machine = m;
    this.at = 0;
    this.start0 = 0;
    if (this.zone === "list" || this.query.trim()) this.zone = "list";
    this.error = "";
  }

  move(by, n) {
    if (!n) return;
    this.at = Math.max(0, Math.min(n - 1, this.at + by));
    if (this.at < this.start0) this.start0 = this.at;
    else if (this.at >= this.start0 + VISIBLE) this.start0 = this.at - VISIBLE + 1;
  }

  // Arrows walk the tiles (three to a row) and drop into the list below them; tab flips the machine.
  key(e, cx) {
    const k = e.key;
    const tiles = this.recent().length;
    const rows = this.shown(this.machine).length;
    if (k === "escape") {
      this.close();
    } else if (k === "enter") {
      this.open(e.modifiers.shift, cx);
    } else if (k === "tab") {
      const names = machines().map((m) => m.name ?? null);
      const i = names.indexOf(this.machine) + (e.modifiers.shift ? -1 : 1);
      this.pickMachine(names[(i + names.length) % names.length]);
    } else if (this.zone === "grid" && tiles && (k === "left" || k === "right")) {
      this.gi = Math.max(0, Math.min(tiles - 1, this.gi + (k === "right" ? 1 : -1)));
    } else if (this.zone === "grid" && k === "down") {
      if (this.gi + 3 < tiles) this.gi += 3;
      else if (rows) { this.zone = "list"; this.at = 0; this.start0 = 0; }
    } else if (this.zone === "grid" && k === "up") {
      if (this.gi >= 3) this.gi -= 3;
    } else if (this.zone === "list" && k === "up") {
      if (this.at === 0 && tiles) { this.zone = "grid"; this.gi = Math.floor((tiles - 1) / 3) * 3; }
      else this.move(-1, rows);
    } else if (this.zone === "list" && k === "down") {
      this.move(1, rows);
    } else {
      return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  // What ↵ opens: the tile or the row under the cursor.
  target() {
    if (this.zone === "grid") {
      const r = this.recent()[this.gi];
      return r ? { machine: r.machine, path: r.path } : null;
    }
    const e = this.shown(this.machine)[this.at];
    return e ? { machine: this.machine, path: e.path, typed: e.typed } : null;
  }

  open(shell, cx) {
    const target = this.target();
    if (!target) {
      this.error = this.query.trim() ? "No folder matches." : "Nothing to open yet.";
      cx.notify();
      return;
    }
    this.start(target, shell, cx);
  }

  // A new space in the folder, running omp (or the machine's shell), selected once it exists. A typed folder is
  // checked first, on its machine. `herdr-app do` answers with what it made or `{ error }`; run() answers nothing.
  start({ machine, path, typed }, shell, cx) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      let made = null;
      try {
        if (typed && (await exec("test", ["-d", path], machine ? { on: machine } : {})).code !== 0) {
          throw new Error(`No folder ${path} on ${label(machine)}.`);
        }
        const args = { ...(machine ? { machine } : {}), folder: path, ...(shell ? {} : { argv: AGENT }) };
        const r = await exec(`${home()}/.local/bin/herdr-app`, ["do", "space.new", JSON.stringify(args)]);
        let out = null;
        try { out = JSON.parse(r.stdout); } catch {}
        if (r.code !== 0 || !out || out.error) throw new Error(out?.error ?? ((r.stderr || r.stdout).trim() || `space.new failed (exit ${r.code}).`));
        made = out;
      } catch (error) {
        this.error = String(error?.message ?? error);
      }
      this.busy = false;
      if (!made) return cx.notify();
      this.close();
      if (made.space) run("space.select", { id: made.space });
    });
  }

  // Finder's folder picker (this Mac's folders only), then straight into omp there.
  browse(cx) {
    cx.spawn(async (cx) => {
      const path = await pickFolder({ prompt: "Start omp here" });
      if (path) this.start({ machine: null, path }, false, cx);
    });
  }

  render() {
    const t = theme();
    const sh = shades(t);
    const ms = machines();
    const recent = this.recent();
    const rows = this.shown(this.machine);
    const h = this.homeOf(this.machine);
    if (this.gi >= recent.length) this.gi = Math.max(0, recent.length - 1);
    if (this.zone === "grid" && !recent.length && rows.length) this.zone = "list";
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    this.start0 = Math.max(0, Math.min(this.start0, rows.length - VISIBLE));
    const ready = (m) => !m || ms.find((x) => x.name === m)?.layout === "ready";
    // Sessions already open in a folder: a count on its row.
    const open = new Map();
    for (const s of spaces()) {
      const tabs = new Set(s.tabs.map((x) => x.id));
      const at = panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
      if (at) open.set(`${key(s.machine)}\n${at}`, (open.get(`${key(s.machine)}\n${at}`) ?? 0) + 1);
    }

    const section = (text, right) => h_flex().h(H.row).mt(S.lg).flex_none().items_center().text_size(T.meta).font_medium().text_color(t.dim)
      .child(div().flex_1().child(text)).when(Boolean(right), (el) => el.child(right));
    const where = (m) => h_flex().h(16).gap(S.xs).flex_none().items_center().text_size(T.meta).text_color(m ? PEACH : t.dim)
      .child(svg(machineIcon(m)).size(11).flex_none()).child(label(m));

    // A recent folder: omp's icon for its latest session in the folder's colour, the folder, how long ago, the
    // session's title and the machine. The cursor tile takes the accent tint and ring; hover the quieter fill.
    const tile = (r, i) => {
      const on = this.zone === "grid" && i === this.gi;
      const { icon, tag, text } = nameParts(r.title);
      const title = tag ? `${tag}: ${text}` : text || tilde(r.path, this.homeOf(r.machine));
      return v_flex().id(`ln-g-${i}`).flex_1().min_w(0).h(TILE_H).px(S.md).gap(S.xs).justify_center().rounded(R.row).border_1()
        .border_color(on ? tint(t.accent, 0.55) : t.border).bg(on ? sh.cursor : t.background)
        .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .tooltip(`${tilde(r.path, this.homeOf(r.machine))} · ${label(r.machine)}`)
        .on_click((e, cx) => { this.zone = "grid"; this.gi = i; this.start({ machine: r.machine, path: r.path }, e.modifiers?.shift, cx); })
        .child(h_flex().h(20).flex_none().gap(S.sm).items_center()
          .child(avatar({ mod: MOD, color: this.colorOf(r.path), icon, initial: base(r.path), size: 20, t }))
          .child(weight(div().flex_1().min_w(0).truncate().text_size(T.body).text_color(t.foreground), W.name).child(base(r.path)))
          .child(mono(div().flex_none().text_size(T.meta).text_color(t.dim)).child(ago(Date.now() - r.at))))
        .child(div().h(16).flex_none().line_height("16px").truncate().text_size(T.meta).text_color(t.muted).child(title))
        .child(where(r.machine));
    };
    const ghostTile = (i) => v_flex().id(`ln-gs-${i}`).flex_1().min_w(0).h(TILE_H).p(S.md).gap(S.sm).rounded(R.row).border_1().border_color(t.border)
      .child(skeleton(t, { w: 96, h: 12, id: `ln-sk-a${i}`, span: 160 }))
      .child(skeleton(t, { w: 132, h: 10, id: `ln-sk-b${i}`, span: 160 }))
      .child(skeleton(t, { w: 64, h: 10, id: `ln-sk-c${i}`, span: 160 }));
    const loadingAny = this.loading.size > 0;
    const cells = recent.length ? recent.map(tile) : loadingAny ? [0, 1, 2].map(ghostTile) : [];
    const grid = [];
    for (let i = 0; i < cells.length; i += 3) {
      const part = cells.slice(i, i + 3);
      while (part.length < 3) part.push(div().flex_1().min_w(0));
      grid.push(h_flex().gap(S.md).children(part));
    }

    // The machine picker beside the search: pill segments in an island-style box; tab flips it.
    const segment = (m) => {
      const name = m.name ?? null, on = name === this.machine;
      return h_flex().id(`ln-m-${key(name) || "here"}`).h(SEG.item).px(S.md).gap(S.xs).flex_none().items_center().rounded(SEG.item / 2)
        .text_size(T.small).font_medium().whitespace_nowrap()
        .when(on, (el) => el.bg(name ? tint(PEACH) : t.raised).text_color(name ? PEACH : t.foreground))
        .when(!on, (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)))
        .on_click((_e, cx) => { this.pickMachine(name); this.input.focus(); cx.notify(); })
        .child(svg(machineIcon(name)).size(12).flex_none())
        .child(label(name))
        .when(Boolean(name) && !ready(name), (el) => el.child(div().text_size(T.meta).font_normal().text_color(t.dim).child("offline")));
    };
    const picker = h_flex().h(SEG.box).px(3).gap(S.hair).flex_none().items_center().rounded(SEG.box / 2).border_1().border_color(t.border).bg(t.background)
      .children(ms.map(segment));

    // A folder: avatar, name, path, and how many sessions are open there. A typed path says what ↵ does.
    const row = (e, i) => {
      const n = open.get(`${key(this.machine)}\n${e.path}`) ?? 0;
      const { icon } = nameParts(e.title);
      return rowFill(h_flex().id(`ln-r-${i}`).h(H.repo).flex_none().px(S.md).gap(S.md).items_center().rounded(R.row)
        .on_click((ev, cx) => { this.zone = "list"; this.at = i; this.start({ machine: this.machine, path: e.path, typed: e.typed }, ev.modifiers?.shift, cx); }), t, { cursor: this.zone === "list" && i === this.at })
        .child(e.typed
          ? div().size(18).flex_none().flex().items_center().justify_center().child(svg("mods/workspace-chrome/folder.svg").size(I.row).text_color(t.muted))
          : avatar({ mod: MOD, color: this.colorOf(e.path), icon, initial: e.name, size: 18, t }))
        .child(weight(div().flex_none().max_w(220).truncate().text_size(T.body).text_color(t.foreground), W.label).child(e.typed ? `Open ${e.name}` : e.name))
        .child(mono(div().flex_1().min_w(0).truncate().text_size(T.meta).text_color(t.dim)).child(tilde(e.path, h)))
        .when(n > 0, (el) => el.child(chip(`${n} open`, undefined, t)));
    };
    const why = this.failed[key(this.machine)];
    const note = rows.length ? ""
      : this.loading.has(key(this.machine)) ? `Reading ${label(this.machine)}…`
        : why ? `Couldn't read ${label(this.machine)}: ${why}`
          : !ready(this.machine) ? `${label(this.machine)} is offline.`
            : this.query.trim() ? "No matching folders." : "No folders yet.";
    const hidden = Math.max(0, rows.length - VISIBLE);
    const listH = VISIBLE * H.repo;
    const thumbH = Math.max(18, (listH * VISIBLE) / Math.max(rows.length, 1));
    const thumbTop = hidden ? ((listH - thumbH) * this.start0) / hidden : 0;

    const button = (id, text, primary, enabled, action) => h_flex().id(id)
      .h(H.field - 4).px(S.lg).items_center().rounded(R.row)
      .bg(primary ? t.solid : t.selected).text_color(primary ? t.solid_foreground : t.foreground)
      .text_size(T.small).font_medium()
      .when(!enabled, (el) => el.opacity(0.4))
      .when(enabled, (el) => el.hover((s) => s.opacity(0.88)))
      .on_click((_e, cx) => { if (enabled) action(cx); })
      .child(text);
    const hints = [["↵", "omp"], ["⇧↵", "shell"], ["⇥", "machine"], ["esc", "close"]];
    const mac = window()?.platform === "macos";

    return v_flex()
      .id("launch")
      .on_key_down((e, cx) => this.key(e, cx))
      .w_full()
      .min_h(0)
      .p(S.xxl)
      .bg(t.popover)
      .text_size(T.body)
      .text_color(t.foreground)
      .child(h_flex().items_center()
        .child(weight(div().flex_1().text_size(T.title), W.name).child("New session"))
        .child(mono(div().text_size(T.meta).text_color(t.dim)).child("esc")))
      .when(grid.length > 0, (el) => el.child(section("Recent")).child(v_flex().gap(S.md).children(grid)))
      .child(section("Folders", picker).mt(S.xl))
      .child(h_flex().mt(S.sm).h(H.field).flex_none().px(S.md).gap(S.md).items_center().rounded(R.row).border_1()
        .border_color(this.zone === "list" ? t.accent : t.input).bg(t.background)
        .child(svg("mods/workspace-chrome/search.svg").size(I.row).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(T.body).text_color(t.foreground)))
      .child(v_flex().id("ln-list").relative().mt(S.sm).h(listH).overflow_hidden()
        .on_scroll_wheel((e, cx) => {
          this.wheel += e.delta.y;
          const step = Math.trunc(this.wheel / 20);
          if (!step) return;
          this.wheel -= step * 20;
          this.start0 = Math.max(0, Math.min(this.start0 - step, rows.length - VISIBLE));
          cx.stop_propagation();
          cx.notify();
        })
        .children(rows.slice(this.start0, this.start0 + VISIBLE).map((e, j) => row(e, this.start0 + j)))
        .when(Boolean(note), (el) => el.child(div().h(H.repo).px(S.md).flex().items_center().text_size(T.small).text_color(t.dim).child(note)))
        .when(hidden > 0, (el) => el.child(div().absolute().right(2).top(thumbTop).w(3).h(thumbH).rounded(2).bg(t.input))))
      .child(h_flex().pt(S.lg).gap(S.md).items_center()
        .child(this.error
          ? div().flex_1().min_w(0).truncate().text_size(T.small).text_color(t.blocked).child(this.error)
          : h_flex().flex_1().min_w(0).gap(S.lg).items_center().overflow_hidden().text_size(T.meta).text_color(t.dim)
            .children(hints.map(([k, word]) => h_flex().gap(S.xs).flex_none().whitespace_nowrap().child(mono(div()).child(k)).child(word))))
        .when(mac && !this.machine, (el) => el.child(button("ln-browse", "Browse…", false, !this.busy, (cx) => this.browse(cx))))
        .child(button("ln-open", this.busy ? "Starting…" : "Open", true, !this.busy && Boolean(this.target()), (cx) => this.open(false, cx))));
  }
}
