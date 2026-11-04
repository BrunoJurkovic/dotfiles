// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/files-bruno (copied in by herdr-reload; edit there).
// Bruno's Files panel, cloned from the shipped `files` (0.1.7) and put on the design system: the panel
// card is radius 14 like the pane cards, the header is the shared one (h 40, px 16, title 13/600), git
// marks use git's colours (A green, M yellow, D red, ? U mauve) instead of red for modified, and the
// tree is a flat row list worked out once per change, so a frame builds rows without walking the tree.
// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window } from "herdr";
import { T, R, H, I, S, W, MONO, weight } from "./lib/tokens.js";
import { card, iconButton } from "./lib/ui.js";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
const INDENT = 16; // px per folder level
const mono = (el) => el.font_family(MONO);
// git's colours for a status letter: A green, M yellow, D red; ? (untracked) and U (conflict) mauve.
const markColor = (mark, t) => ({ A: t.ansi2, M: t.ansi3, D: t.ansi1 })[mark] ?? t.ansi5;

async function directory(path, on) {
  if (!on && window()?.platform === "windows") {
    const r = await exec("powershell", ["-NoProfile", "-Command", "& { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)) } }) | ConvertTo-Json -Compress }", path]);
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  }
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ] && [ ! -L "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {}; this.flat = null;
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async cx => {
      try { while (this.watched === root) { await watchFolder(root); if (this.watched === root) this.refresh(cx); } }
      catch { if (this.watched === root) this.watched = null; }
    });
  }

  async loadFolder(path, context) {
    const on = this.on, root = this.root;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (key() !== context || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    this.flat = null;
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    if (this.loading) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set();
      this.pending = new Set(); this.marks = {}; this.flat = null; this.show(null); this.watched = null; this.error = null; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) await this.loadFolder(path, context);
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          const status = await exec("git", ["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=normal"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" ? "?" : xy.includes("U") ? "U" : xy.includes("A") ? "A" : xy.includes("D") ? "D" : "M";
          }
        }
        if (key() !== context) return;
        this.marks = marks; this.flat = null; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (key() === context) this.error = String(e); }
          finally { this.pending.delete(path); cx.notify(); }
        });
      }
    }
    this.flat = null;
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || key() !== context) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: T.small,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && key() === context) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // The visible tree as one flat list of rows, depth first: worked out when entries, folders or marks change
  // (they set `flat` to null), so a frame never walks the tree or looks up a mark.
  flatten() {
    const out = [];
    const walk = (prefix, depth) => {
      for (const entry of this.entries.get(prefix) ?? []) {
        if (out.length >= TOTAL) return;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path);
        out.push({ path, name: entry.name, dir: entry.dir, depth, open, mark: this.marks[`${this.root}/${path}`] });
        if (entry.dir && open && depth < 40) walk(path, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }

  // One row: chevron (folders), icon, name, git mark. A press opens a folder or previews a file.
  row(r, t) {
    return h_flex().id(`file-${r.path}`).h(H.row).flex_none().pl(S.md + r.depth * INDENT).pr(S.md).gap(S.sm).items_center().rounded(R.row)
      .hover(s => s.bg(t.hover))
      .on_click((_e, cx) => r.dir ? this.toggle(r.path, cx) : this.show(r.path, cx))
      .child(r.dir ? svg(`mods/files-bruno/chevron-${r.open ? "down" : "right"}.svg`).size(11).flex_none().text_color(t.dim) : div().w(11).flex_none())
      .child(svg(`mods/files-bruno/${r.dir ? "folder" : "file"}.svg`).size(I.row).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().text_size(T.body).child(r.name))
      .when(Boolean(r.mark), el => el.child(mono(div().flex_none().text_size(T.meta).font_medium().text_color(markColor(r.mark, t))).child(r.mark)));
  }

  // The shared panel header: back (a file is open), title, then the open file or the folder's name.
  header(t) {
    const right = this.file ?? this.root?.split(/[\\/]/).pop() ?? "";
    return h_flex().h(H.panel).flex_none().px(S.xl).gap(S.md).items_center().border_b(1).border_color(t.border)
      .when(Boolean(this.file), el => el.child(iconButton("files-back", "mods/workspace-chrome/chevron-left.svg", { tip: "Back to files", onClick: (_e, cx) => { this.show(null); cx.notify(); }, t })))
      .child(weight(div().flex_none().text_size(T.body), W.name).child("Files"))
      .child((this.file ? mono(div()) : div()).flex_1().min_w(0).truncate().text_right().text_size(T.small).text_color(t.dim).child(right));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme();
    const flat = (this.flat ??= this.flatten());
    const message = this.error || (flat.length ? "" : this.loading ? "Loading files…" : this.root ? "No files" : "No folder");
    return card(t).id("files").size_full().min_h(0).text_color(t.foreground).text_size(T.body)
      .child(this.header(t))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(S.md).children(flat.map(r => this.row(r, t)))
        .when(Boolean(message), el => el.child(div().px(S.md).py(S.md).text_size(T.small).text_color(t.dim).child(message)))
        .when(this.limited, el => el.child(div().px(S.md).py(S.md).text_size(T.meta).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(S.lg).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
