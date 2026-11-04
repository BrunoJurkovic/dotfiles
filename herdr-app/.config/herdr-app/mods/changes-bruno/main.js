// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/changes-bruno (copied in by herdr-reload; edit there).
// Bruno's Changes panel, cloned from the shipped `changes` (0.1.7) and put on the design system: radius 14
// panel card, the shared header (title, a neutral file-count chip, +/− totals in mono), git's status
// colours (A green, M yellow, D red, U mauve) instead of red for modified, 12 % diff tints, and the commit
// row's input and button as the other panels draw them. File names and totals are worked out when the
// data arrives, not per frame; the diff is a virtual list, so a frame draws only the rows in view.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings } from "herdr";
import { T, R, H, S, W, MONO, weight } from "./lib/tokens.js";
import { card, chip } from "./lib/ui.js";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;
const mono = (el) => el.font_family(MONO);
// git's colours for a status letter: A green, M yellow, D red; U (conflict) mauve.
const markColor = (mark, t) => ({ A: t.ansi2, M: t.ansi3, D: t.ansi1 })[mark] ?? t.ansi5;
// px: the changed-file list grows with its files up to this, then scrolls.
const LIST_MAX = 200;

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

export default class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.sum = null; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => { this.message = this.input.value(); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.sum = null; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.sum = null; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", args, { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          // The folder and file name are split once here, not per frame.
          const parts = path.split("/"), name = parts.pop();
          files.push({ path, status: s, fresh, name, dir: parts.length ? parts.join("/") + "/" : "", ...stat });
        }
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.sum = null; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text); this.sum = null;
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", ["diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...lines.map(line => line.length * 7 + 50));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  // A diff line: the gutter number (mono 11 dim, 36 wide) and the text, tinted 12 % for + and −; a hunk
  // header is a raised bar in dim. No handlers: this runs inside the virtual list's renderer.
  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(S.lg).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().pl(S.md).gap(S.md).when(kind === "+", (e) => e.bg(t.ansi2 + "1f")).when(kind === "-", (e) => e.bg(t.ansi1 + "1f"))
      .child(div().w(36).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  // A changed file: git mark, folder (dim) and name, +/− counts; a press opens its diff.
  fileRow(f, t) {
    return h_flex().id(`change-${f.path}`).h(H.row).flex_none().px(S.md).gap(S.md).items_center().rounded(R.row)
      .when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.pick(f.path, cx))
      .child(mono(div().w(S.lg + S.hair).flex_none().text_size(T.meta).font_medium().text_color(markColor(f.status, t))).child(f.status))
      .child(h_flex().flex_1().min_w(0).text_size(T.body)
        .child(div().text_color(t.dim).truncate().child(f.dir))
        .child(div().max_w(260).min_w(0).truncate().child(f.name)))
      .when(f.add > 0, (e) => e.child(mono(div().flex_none().text_size(T.meta).text_color(t.done)).child(`+${f.add}`)))
      .when(f.del > 0, (e) => e.child(mono(div().flex_none().text_size(T.meta).text_color(t.blocked)).child(`−${f.del}`)));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), files = this.files;
    const { add, del } = (this.sum ??= { add: files.reduce((n, f) => n + f.add, 0), del: files.reduce((n, f) => n + f.del, 0) });
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    const listH = Math.min(LIST_MAX, Math.max(44, files.length * H.row + S.md * 2));
    const empty = this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder");
    return card(t).id("changes").size_full().min_h(0).text_color(t.foreground).text_size(T.body).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(H.panel).flex_none().px(S.xl).gap(S.md).items_center().border_b(1).border_color(t.border)
        .child(weight(div().flex_none().text_size(T.body), W.name).child("Changes"))
        .child(chip(files.length === 1 ? "1 file" : `${files.length} files`, undefined, t))
        .child(div().flex_1())
        .child(mono(div().flex_none().text_size(T.meta).text_color(t.done)).child(`+${add}`))
        .child(mono(div().flex_none().text_size(T.meta).text_color(t.blocked)).child(`−${del}`)))
      .child(v_flex().id("changes-list").flex_none().h(listH).overflow_y_scrollbar().p(S.md).border_b(1).border_color(t.border)
        .children(files.map((f) => this.fileRow(f, t)))
        .when(!files.length, (e) => e.child(div().px(S.md).py(S.xs).text_size(T.small).text_color(t.dim).child(empty))))
      .when(this.limited, el => el.child(div().px(S.xl).py(S.xs).text_size(T.meta).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(T.meta)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && files.length > 0, (e) => e.child(div().absolute().top(S.sm).px(S.lg).text_color(t.dim).child("Select a file to view its changes"))))
      .when(Boolean(this.note), (e) => e.child(div().px(S.xl).pb(S.md).text_size(T.meta).text_color(t.blocked).child(this.note)))
      .child(h_flex().flex_none().px(S.xl).py(S.md).gap(S.md).border_t(1).border_color(t.border)
        .child(div().id("commit-message").flex_1().min_w(0).h(H.field).px(S.lg).flex().items_center().rounded(R.row).border_1().border_color(this.typing ? t.accent : t.input).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(T.body).text_color(t.foreground)))
        .child(div().id("commit").h(H.field).px(S.xl).flex().items_center().rounded(R.row).bg(enabled ? t.solid : t.raised).text_color(enabled ? t.solid_foreground : t.dim).text_size(T.small).font_medium().on_click((_e, cx) => this.commit(cx)).child(this.busy ? "Committing…" : "Commit")));
  }
}
