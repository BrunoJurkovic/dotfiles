// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/prs (copied in by herdr-reload; edit there).
// Pull requests of the focused space's repo: this branch's PR and its checks first (a flat section, no
// card inside the panel card), then the repo's other open PRs. Read-only `gh` runs on the machine the
// space lives on; a click opens the browser here. The panel header is the one Files and Changes use:
// title, repo, the peach machine chip, refresh. Loading is the panel's own shape as skeleton blocks with a
// shimmer (the one moving thing; the refresh button waits still); the branch PR's checks are one bar that
// grows in when the answer lands.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, machines, layout, exec, theme } from "herdr";
import { T, R, H, I, S, W, MONO, weight } from "./lib/tokens.js";
import { card, chip, machineChip, sectionHeader, iconButton } from "./lib/ui.js";
import { skeleton } from "./lib/motion.js";

// refresh and git-pull-request are this mod's own; the rest come from the shipped workspace-chrome mod.
const OWN = new Set(["git-pull-request", "refresh"]);
const icon = (name) => `mods/${OWN.has(name) ? "prs" : "workspace-chrome"}/${name}.svg`;
const STALE = 60000, LIMIT = 20;
const VIEW = "number,title,url,state,isDraft,reviewDecision,mergeable,headRefName,baseRefName,author,statusCheckRollup";
const LIST = "number,title,url,isDraft,reviewDecision,headRefName,author,createdAt,statusCheckRollup";

const mono = (el) => el.font_family(MONO);

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, branch: pane?.branch ?? space?.branch ?? null };
}
const key = () => JSON.stringify(location());

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
  return Boolean(panel && !panel.hidden && body?.active === "prs");
}

const openUrl = (url) => { if (/^https:\/\//.test(url ?? "")) exec("open", [url]).catch(() => {}); };

// How long ago a PR was opened, one unit: now, 4m, 3h, 2d, 5w, 3mo, 1y. PRs live longer than lib's ago()
// counts (days), so this one goes on to weeks, months and years.
function age(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return "";
  for (const [size, unit] of [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]]) {
    if (s >= size) return `${Math.floor(s / size)}${unit}`;
  }
  return "now";
}

// Checks, from gh's statusCheckRollup: CheckRuns and commit StatusContexts alike.
function summarize(rollup) {
  const latest = new Map();
  for (const c of rollup ?? []) {
    const status = c.__typename === "StatusContext";
    const id = status ? `s|${c.context}` : `c|${c.workflowName ?? ""}|${c.name}`;
    const old = latest.get(id);
    if (!old || (c.startedAt ?? "") >= (old.startedAt ?? "")) latest.set(id, c);
  }
  const out = { pass: 0, skipped: 0, fail: [], pending: [] };
  for (const c of latest.values()) {
    const status = c.__typename === "StatusContext";
    const name = status ? c.context : [c.workflowName, c.name].filter(Boolean).join(" / ");
    const item = { name, url: c.detailsUrl || c.targetUrl || null };
    if (status) {
      if (c.state === "SUCCESS") out.pass++;
      else if (c.state === "FAILURE" || c.state === "ERROR") out.fail.push(item);
      else out.pending.push(item);
    } else if (c.status !== "COMPLETED") out.pending.push(item);
    else if (c.conclusion === "SUCCESS") out.pass++;
    else if (c.conclusion === "SKIPPED" || c.conclusion === "NEUTRAL") out.skipped++;
    else out.fail.push(item);
  }
  out.fail.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

const person = (a) => (a?.login ?? "").replace(/^app\//, "");

function normalize(pr) {
  return {
    number: pr.number, title: pr.title, url: pr.url, branch: pr.headRefName, author: person(pr.author),
    draft: Boolean(pr.isDraft), state: pr.state ?? "OPEN", review: pr.reviewDecision || "", mergeable: pr.mergeable,
    created: pr.createdAt, checks: summarize(pr.statusCheckRollup),
  };
}

// Why gh could not answer, from its words and exit code (4 = signed out). Checked in order: the
// "no known GitHub host" message also tells you to run `gh auth login`.
function problem(r) {
  const text = `${r.stderr || ""}\n${r.stdout || ""}`.trim();
  const first = text.split("\n").find((l) => l.trim())?.trim() ?? `gh exited with ${r.code}`;
  if (/not a git repository/i.test(text)) return { kind: "nogit" };
  if (/no git remotes found|none of the git remotes|known GitHub host/i.test(text)) return { kind: "noremote" };
  if (/no default remote repository|set-default/i.test(text)) return { kind: "default" };
  if (r.code === 4 || /GH_TOKEN|gh auth login|HTTP 401|Bad credentials|not logged in/i.test(text)) return { kind: "auth" };
  if (/rate limit/i.test(text)) return { kind: "limit" };
  if (/dial tcp|no such host|Could not resolve host|i\/o timeout|connection refused|network is unreachable|TLS handshake|error connecting|proxyconnect/i.test(text)) return { kind: "offline", detail: first };
  if (/Could not resolve to a Repository|HTTP 404/i.test(text)) return { kind: "missing" };
  return { kind: "other", detail: first };
}

// exec itself rejected: gh is not installed, the folder is gone or the machine can't be reached.
function thrown(e, on) {
  const msg = String(e?.message ?? e);
  if (on && machines().find((m) => m.name === on)?.layout === "unavailable") return { kind: "machine" };
  if (/cannot start folder/i.test(msg)) return { kind: "folder" };
  if (/cannot start gh\b|ENOENT/i.test(msg)) return { kind: "nogh" };
  if (/unreachable|offline|unknown machine|timed out|not connected/i.test(msg)) return { kind: "machine" };
  return { kind: "other", detail: msg.split("\n")[0] };
}

class Failure extends Error {
  constructor(info) { super(info.kind); this.info = info; }
}

// Everything the render needs, worked out here once per answer: the branch's PR, the other open PRs (the
// branch's own is not listed twice), and whether the list hit the limit.
async function load(cwd, on) {
  const gh = (args) => exec("gh", args, { cwd, on });
  const [view, list, repo] = await Promise.all([
    gh(["pr", "view", "--json", VIEW]),
    gh(["pr", "list", "--state", "open", "--limit", String(LIMIT), "--json", LIST]),
    gh(["repo", "view", "--json", "nameWithOwner,url"]),
  ]);
  // A branch with no PR is an answer, not an error.
  const none = view.code !== 0 && /no pull requests? found|could not determine current branch|not on any branch/i.test(`${view.stderr}${view.stdout}`);
  if (view.code !== 0 && !none) throw new Failure(problem(view));
  if (list.code !== 0) throw new Failure(problem(list));
  let info = null;
  if (repo.code === 0) { try { info = JSON.parse(repo.stdout); } catch { /* the name is a nicety */ } }
  const current = none ? null : normalize(JSON.parse(view.stdout));
  const open = JSON.parse(list.stdout).map(normalize);
  return {
    repo: info?.nameWithOwner ?? null, repoUrl: info?.url ?? null,
    current,
    others: open.filter((pr) => pr.number !== current?.number),
    full: open.length >= LIMIT,
  };
}

export default class Prs extends View {
  init(_props, cx) {
    this.cache = new Map(); // where it was asked → { data, error, at }
    this.loading = false;
    this.barW = 0; // the check bar's measured width; panelW is the fallback (the bar's own measure can fail to arrive)
    this.panelW = 0;
    this.barPending = false;
    this.refresh(cx);
    // Fresh when the space or branch changed, and once a minute: only while the panel shows.
    cx.timer.every(5000, (cx) => {
      const started = this.refresh(cx), sized = this.kickBar();
      if (started || sized) cx.notify();
    });
  }

  // A check bar drawn 0 wide whose own measure never came: size it from the panel's width (borders and
  // paddings are 34 px), so it still grows in, at most one tick late.
  kickBar() {
    if (!this.barPending || !this.panelW) return false;
    this.barW = Math.max(0, this.panelW - 34);
    this.barPending = false;
    return true;
  }

  // Starts a load when the place changed or the answer is a minute old. Returns whether it started.
  refresh(cx, force = false) {
    if (this.loading || !shown()) return false;
    const { cwd, on } = location(), context = key(), entry = this.cache.get(context);
    this.context = context;
    if (!force && entry && Date.now() - entry.at < STALE) return false;
    if (!cwd) { this.cache.set(context, { error: { kind: "folder" }, at: Date.now() }); return false; }
    this.loading = true;
    cx.spawn(async (cx) => {
      const old = this.cache.get(context);
      try {
        const data = await load(cwd, on);
        this.cache.set(context, { data, at: Date.now() });
      } catch (e) {
        const error = e instanceof Failure ? e.info : thrown(e, on);
        this.cache.set(context, { data: old?.data, error, at: Date.now() });
      } finally {
        while (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
        this.loading = false;
        cx.notify();
      }
    });
    return true;
  }

  // One count with its mark: ✓ 12 in done, ✗ 1 in blocked, a dot for what is still running.
  stat(mark, n, color) {
    return mono(h_flex().gap(S.xs).items_center().flex_none().text_size(T.meta).font_medium().text_color(color)).child(mark).child(String(n));
  }

  // The checks as counts. A row shows nothing when there are none; the branch's own PR says so.
  checks(c, t, pinned = false) {
    const none = !c.pass && !c.fail.length && !c.pending.length;
    if (none) return pinned ? div().flex_none().text_size(T.meta).text_color(t.dim).child(c.skipped ? `${c.skipped} skipped` : "No checks") : null;
    const tick = svg(icon("check")).size(I.inline).flex_none(), cross = svg(icon("x")).size(I.inline).flex_none();
    const dot = div().w(I.inline).flex_none().flex().justify_center().child(div().size(S.sm).rounded(S.sm / 2).bg(t.ansi3));
    return h_flex().gap(S.md).items_center().flex_none()
      .when(c.pass > 0, (e) => e.child(this.stat(tick, c.pass, t.done)))
      .when(c.fail.length > 0, (e) => e.child(this.stat(cross, c.fail.length, t.blocked)))
      .when(c.pending.length > 0, (e) => e.child(this.stat(dot, c.pending.length, t.ansi3)))
      .when(pinned && c.skipped > 0, (e) => e.child(div().flex_none().text_size(T.meta).text_color(t.dim).child(`${c.skipped} skipped`)));
  }

  // Review state: draft, approved, changes requested, review required (nothing when there is none).
  reviewChip(pr, t) {
    if (pr.draft) return chip("Draft", t.muted, t);
    const [label, tone] = {
      APPROVED: ["Approved", t.done],
      CHANGES_REQUESTED: ["Changes requested", t.blocked],
      REVIEW_REQUIRED: ["Review required", t.ansi3],
    }[pr.review] ?? [];
    return label ? chip(label, tone, t) : null;
  }

  label(text, t, right) {
    return sectionHeader(text, { right, t }).px(S.md);
  }

  // This branch's PR, flat: state and review chips, the title, the checks and the failing checks by name
  // (each opens its run). The accent dot says it is the one you are on.
  pinned(pr, t) {
    const tone = { OPEN: t.done, MERGED: t.ansi5, CLOSED: t.blocked }[pr.state] ?? t.muted;
    const review = this.reviewChip(pr, t), bar = this.checkBar(pr.checks, t);
    return v_flex().flex_none().px(S.md).pb(S.md).gap(S.md)
      .child(h_flex().gap(S.sm).items_center().flex_wrap()
        .child(chip(pr.state === "OPEN" ? "Open" : pr.state[0] + pr.state.slice(1).toLowerCase(), tone, t))
        .when(Boolean(review), (e) => e.child(review))
        .when(pr.mergeable === "CONFLICTING", (e) => e.child(chip("Conflicts", t.blocked, t)))
        .child(div().flex_1())
        .child(mono(div().flex_none().text_size(T.meta).text_color(t.dim)).child(`#${pr.number}`)))
      .child(h_flex().gap(S.sm).items_start()
        .child(div().size(S.sm).flex_none().mt(S.sm).rounded(S.sm / 2).bg(t.accent))
        .child(weight(div().id(`pr-current-${pr.number}`).flex_1().min_w(0).max_h(36).overflow_hidden().line_height("18px")
          .text_size(T.body).text_color(t.foreground).cursor_pointer().hover((s) => s.text_color(t.accent))
          .on_click(() => openUrl(pr.url)), W.name).child(pr.title)))
      .child(this.checks(pr.checks, t, true))
      .when(Boolean(bar), (e) => e.child(bar))
      .when(pr.checks.fail.length > 0, (e) => e.child(v_flex().children(pr.checks.fail.map((c, i) =>
        h_flex().id(`fail-${i}`).h(H.sub).flex_none().gap(S.sm).items_center().px(S.sm).rounded(R.row).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click(() => openUrl(c.url || pr.url))
          .child(svg(icon("x")).size(I.inline).flex_none().text_color(t.blocked))
          .child(div().flex_1().min_w(0).truncate().text_size(T.small).text_color(t.muted).child(c.name))))))
      .when(pr.checks.pending.length > 0 && pr.checks.fail.length === 0, (e) => e.child(div().min_w(0).truncate().text_size(T.meta).text_color(t.dim)
        .child(`Running: ${pr.checks.pending.map((c) => c.name).join(", ")}`)));
  }

  // Another open PR: #number and title, then author · age with the review chip and checks. The branch is
  // the tooltip.
  row(pr, t) {
    const review = this.reviewChip(pr, t), checks = this.checks(pr.checks, t);
    return v_flex().id(`pr-${pr.number}`).flex_none().px(S.md).py(S.md).gap(S.xs).rounded(R.row).cursor_pointer().hover((s) => s.bg(t.hover))
      .tooltip(pr.branch ?? "")
      .on_click(() => openUrl(pr.url))
      .child(h_flex().gap(S.sm).items_center()
        .child(mono(div().flex_none().text_size(T.meta).text_color(t.dim)).child(`#${pr.number}`))
        .child(weight(div().flex_1().min_w(0).truncate().text_size(T.body).text_color(t.foreground), W.label).child(pr.title)))
      .child(h_flex().gap(S.md).items_center().text_size(T.meta).text_color(t.muted)
        .child(div().flex_1().min_w(0).truncate().child([pr.author, age(pr.created)].filter(Boolean).join(" · ")))
        .when(Boolean(review), (e) => e.child(review))
        .when(Boolean(checks), (e) => e.child(checks)));
  }

  // The checks of the branch's PR as one proportional bar under their counts: done, failing, running. It
  // grows in when the answer arrives: the segments start at 0 wide and the width transition runs natively
  // once the bar has been measured (render resets the measure while there is no answer to show).
  checkBar(c, t) {
    const parts = [[c.pass, t.done], [c.fail.length, t.blocked], [c.pending.length, t.ansi3]].filter(([n]) => n > 0);
    const total = parts.reduce((sum, [n]) => sum + n, 0);
    if (!total) return null;
    this.barPending = !this.barW;
    const gap = 2, usable = Math.max(0, (this.barW ?? 0) - gap * (parts.length - 1));
    let left = usable;
    const widths = parts.map(([n], i) => {
      const w = i === parts.length - 1 ? left : Math.min(left, Math.max(3, Math.round((usable * n) / total)));
      left -= w;
      return w;
    });
    // A new id per answer: an element that stays mounted reports no size change, so the bar would never be
    // measured again after a load and would stay 0 wide.
    const gen = this.barGen ?? 0;
    return h_flex().id(`prs-checks-bar-${gen}`).w_full().h(4).flex_none().gap(gap).overflow_hidden()
      .on_size_change((size, cx) => {
        const w = Math.round(size.width);
        if (w === this.barW) return;
        this.barW = w;
        cx.notify();
      })
      .children(parts.map(([_n, color], i) => div().id(`prs-checks-bar-${gen}-${i}`).h_full().flex_none().rounded(2).bg(color)
        .w(widths[i]).transition("width", { duration: 400, easing: "ease-out" })));
  }

  // Loading: the panel's own shape as quiet blocks, one shimmer in each. Same rhythm as the real list
  // (label, this branch's chips, title and checks, label, rows), so nothing jumps when the answer lands.
  placeholder(t) {
    const sk = (id, o) => skeleton(t, { id: `prs-sk-${id}`, ...o });
    const row = (i) => v_flex().flex_none().px(S.md).py(S.md).gap(S.xs)
      .child(h_flex().gap(S.sm).items_center().child(sk(`${i}-n`, { w: 28, h: 11, radius: 4 })).child(sk(`${i}-t`, { w: "fill", h: 13, radius: 4 })))
      .child(sk(`${i}-m`, { w: 120, h: 11, radius: 4 }));
    return v_flex().id("prs-loading").flex_1().min_h(0).overflow_hidden().p(S.md)
      .child(h_flex().h(H.row).flex_none().items_center().px(S.md).child(sk("l1", { w: 72, h: 9, radius: 4 })))
      .child(v_flex().flex_none().px(S.md).pb(S.md).gap(S.md)
        .child(h_flex().gap(S.sm).child(sk("c1", { w: 44, h: H.chip, radius: H.chip / 2 })).child(sk("c2", { w: 76, h: H.chip, radius: H.chip / 2 })))
        .child(sk("t1", { h: 13, radius: 4 }))
        .child(sk("t2", { w: "62%", h: 13, radius: 4 }))
        .child(sk("ck", { w: 96, h: 11, radius: 4 })))
      .child(h_flex().h(H.row).flex_none().items_center().px(S.md).mt(S.md).child(sk("l2", { w: 112, h: 9, radius: 4 })))
      .children([0, 1, 2].map(row));
  }

  // A state the panel can't show PRs in: a 16 px dim icon, a title, one line of why.
  notice(info, on, folder, t) {
    const where = on ?? "This Mac";
    const [glyph, title, text] = {
      nogit: ["git-pull-request", "Not a git repository", `${folder} isn't inside a git repository.`],
      noremote: ["git-pull-request", "Not a GitHub repository", `${folder} has no GitHub remote, so there are no pull requests to show.`],
      default: ["git-pull-request", "Pick a GitHub repository", `${folder} has several remotes and none is gh's default. Run gh repo set-default there.`],
      nogh: ["x", "GitHub CLI not installed", `Install gh on ${where} (brew install gh) to see pull requests here.`],
      auth: ["x", "GitHub CLI not signed in", `Run gh auth login on ${where}.`],
      machine: ["server", `${on ?? "Machine"} is offline`, "Pull requests come back when the machine reconnects."],
      offline: ["x", "Can't reach GitHub", info.detail ?? ""],
      limit: ["clock", "GitHub rate limit reached", "It tries again in a minute."],
      missing: ["git-pull-request", "Repository not found", "GitHub doesn't know this repository, or the signed-in account can't see it."],
      folder: ["git-pull-request", "No folder", "This space has no folder to look in."],
      other: ["x", "Couldn't load pull requests", info.detail ?? ""],
    }[info.kind] ?? ["x", "Couldn't load pull requests", ""];
    return v_flex().flex_1().items_center().justify_center().p(S.xxl).gap(S.md)
      .child(svg(icon(glyph)).size(I.empty).text_color(t.dim))
      .child(weight(div().text_size(T.body).text_color(t.muted).text_center(), W.name).child(title))
      .when(Boolean(text), (e) => e.child(div().max_w(260).text_size(T.small).text_color(t.dim).text_center().child(text)));
  }

  // The same header as Files and Changes: h 40, px 16, title 13/600, the repo, the machine, refresh.
  header(name, on, t, refreshing) {
    const busy = svg(icon("spinner")).size(I.row).flex_none().text_color(t.working).spin(900);
    return h_flex().h(H.panel).flex_none().px(S.xl).gap(S.md).items_center().border_b(1).border_color(t.border)
      .child(weight(div().flex_none().text_size(T.body), W.name).child("Pull requests"))
      .child(div().flex_1().min_w(0).truncate().text_right().text_size(T.small).text_color(t.dim).child(name))
      .when(Boolean(on), (e) => e.child(machineChip(on)))
      .child(iconButton("prs-refresh", refreshing ? busy : icon("refresh"), {
        tip: "Refresh",
        onClick: (_e, cx) => { if (this.refresh(cx, true)) cx.notify(); },
        t,
      }));
  }

  render(cx) {
    const t = theme(), loc = location(), context = JSON.stringify(loc);
    if (this.context !== context) this.refresh(cx);
    const { on, branch, cwd } = loc;
    const entry = this.cache.get(context), data = entry?.data, error = entry?.error;
    const folder = cwd?.split("/").filter(Boolean).pop() ?? "";
    const name = data?.repo?.split("/").pop() ?? folder;

    let body;
    if (!data && error) body = this.notice(error, on, folder || "this folder", t);
    else if (!data) {
      // Loading: the skeleton shimmers (the one moving thing); the refresh button waits still. The check bar
      // is measured again when the answer lands (a fresh bar element, see checkBar), so it grows in.
      this.barW = 0;
      this.barGen = (this.barGen ?? 0) + 1;
      body = this.placeholder(t);
    } else {
      body = v_flex().id("prs-body").flex_1().min_h(0).overflow_y_scrollbar().p(S.md)
        .when(Boolean(error), (e) => e.child(div().px(S.md).py(S.xs).text_size(T.meta).text_color(t.ansi3).child(`Couldn't refresh: ${describe(error, on)}`)))
        .child(this.label("This branch", t, branch ? mono(div().max_w(180).truncate().text_size(T.meta).text_color(t.dim)).child(branch) : null))
        .child(data.current ? this.pinned(data.current, t)
          : div().px(S.md).pb(S.md).text_size(T.small).text_color(t.dim).child(branch ? `No pull request for ${branch}` : "No pull request for this checkout"))
        .child(this.label("Open pull requests", t, mono(div().text_size(T.meta).font_normal().text_color(t.dim)).child(data.full ? `${data.others.length}+` : String(data.others.length))).mt(S.md))
        .children(data.others.map((pr) => this.row(pr, t)))
        .when(!data.others.length, (e) => e.child(div().px(S.md).py(S.xs).text_size(T.small).text_color(t.dim).child(data.current ? "No other open pull requests" : "No open pull requests")))
        .when(Boolean(data.repoUrl), (e) => e.child(div().id("prs-all").flex_none().mt(S.xs).px(S.md).py(S.sm).self_start().cursor_pointer().text_size(T.small).text_color(t.dim)
          .hover((s) => s.text_color(t.foreground).underline()).on_click(() => openUrl(`${data.repoUrl}/pulls`)).child("Open all on GitHub")));
    }
    return card(t).id("prs").size_full().min_h(0).text_color(t.foreground).text_size(T.body)
      .on_size_change((size) => { const w = Math.round(size.width); if (w > 0) this.panelW = w; })
      .child(this.header(name, on, t, this.loading && Boolean(data))).child(body);
  }
}

const describe = (info, on) => ({
  nogit: "not a git repository", noremote: "no GitHub remote", default: "no default repository", nogh: "gh isn't installed",
  auth: "gh isn't signed in", machine: `${on ?? "the machine"} is offline`, offline: "GitHub is unreachable",
  limit: "rate limited", missing: "repository not found", folder: "folder not found",
}[info.kind] ?? info.detail ?? "unknown error");
