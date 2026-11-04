// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/usage (copied in by herdr-reload; edit there).
// The data side of the omp usage panel: one fetch loop every copy of this mod runs, one answer in
// shared state for every reader (the panel, its headless copy in the layout's floating list, the
// status bar's chip).
//
//   omp usage --json               limits per account, named (drawn on this Mac only)   every USAGE_MS, this Mac
//   omp config get auth.accountPolicies --json   each account's priority, read alongside it
//   omp stats --json               syncs omp's session files into its stats.db   every STATS_MS, per machine
//   python3 (HIST below)           reads the hourly rollup omp keeps in stats.db: today, 7 days,
//                                  30 days and all time (omp stats --json itself only covers 24 h)
//   jsc (render.mjs)               draws the panel's picture from those answers   when they or the panel change
//
// Shared keys: "omp.usage" and "omp.stats" hold the last good answer (a failed fetch keeps it and
// adds `error`), "omp.fetch" holds the schedule: `busy` (nothing else runs while it is set), `req`
// (a manual refresh) and, per kind, when it was last tried and last worked. "omp.chip" is the
// status bar's chip, already drawn (an SVG file in data/usage/).
import { exec, machines, shared, setShared, theme, appHome, window as win } from "herdr";
import { chipSvg } from "./art.js";

export const USAGE_MS = 300000;
export const STATS_MS = 120000;
export const RETRY_MS = 60000;
// A lock older than this is a copy that went away mid-fetch (a hot reload, a closed layout). One
// machine's stats are two execs of 30 s at most.
const LOCK_MS = 65000;
export const MANUAL_GAP_MS = 10000;

const NAMES = { anthropic: "Anthropic", "openai-codex": "Codex" };

// ── Scheduling ───────────────────────────────────────────────

const idle = () => ({ busy: null, req: 0, usage: { tried: 0, failed: false, at: 0 }, stats: { tried: 0, failed: false, at: 0 } });
export const fetchState = () => shared("omp.fetch") ?? idle();
// An answer left in shared state by the pooled version of this mod (a hot reload keeps it) is no answer:
// providers[].accounts was a count then, a list now. tick() fetches again at once.
const current = (d) => Boolean(d?.providers?.every((p) => Array.isArray(p.accounts)));
export const usage = () => { const d = shared("omp.usage"); return current(d) ? d : null; };
export const stats = () => shared("omp.stats") ?? null;

export function busy(now = Date.now(), f = fetchState()) {
  return f.busy && now - f.busy.at < LOCK_MS ? f.busy : null;
}

function patch(change) {
  setShared("omp.fetch", { ...fetchState(), ...change });
}

// A copy going away gives back the lock it holds.
export function release(owner) {
  if (fetchState().busy?.by === owner) patch({ busy: null });
}

function wants(st, every, req, now) {
  return st.tried < req || now - st.tried >= (st.failed ? Math.min(every, RETRY_MS) : every);
}

// Starts the fetch that is due, if nothing is in flight. Every copy calls this on its own timer;
// reading and setting shared state is one step, so the first copy to ask takes the lock. When it
// finishes it asks again, so a manual refresh runs limits and stats back to back.
export function tick(cx, owner, now = Date.now()) {
  const f = fetchState();
  if (busy(now, f)) return false;
  const kind = wants(f.stats, STATS_MS, f.req, now) ? "stats" : wants(f.usage, USAGE_MS, f.req, now) || (shared("omp.usage") && !usage()) ? "usage" : null;
  if (!kind) return false;
  patch({ busy: { at: now, what: kind, by: owner } });
  cx.spawn(async (cx) => {
    let failed = true;
    try {
      failed = await (kind === "stats" ? fetchStats(now) : fetchUsage(now));
    } finally {
      const prev = fetchState()[kind];
      patch({ busy: null, [kind]: { tried: now, failed, at: failed ? prev.at : Date.now() } });
      cx.notify();
      tick(cx, owner);
    }
  });
  return true;
}

// The refresh button: both kinds again, now. Ignored while a fetch runs and for MANUAL_GAP_MS after
// the last request.
export function requestRefresh(cx, owner) {
  const now = Date.now();
  const f = fetchState();
  if (busy(now, f) || now - f.req < MANUAL_GAP_MS) return false;
  patch({ req: now });
  tick(cx, owner, now);
  return true;
}

const firstLine = (text) => String(text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
const reason = (e) => firstLine(String(e?.message ?? e).replace(/^`herdr\.exec`:\s*/, "")).slice(0, 200) || "unknown error";

function jsonOf(text) {
  const at = text.indexOf("{");
  return JSON.parse(at > 0 ? text.slice(at) : text);
}

// ── Drawn files ──────────────────────────────────────────────

let serial = 0;

// Writes an SVG to data/usage/ under the app's home (image() only loads from there; an absolute path
// outside it draws nothing). Rare on purpose: the panel redraws only when its inputs change, and a
// write wakes Herdr's folder watchers. A new name each time, so an image never shows a cached old one;
// returns the path to hand to image(). Nothing is deleted here: a task cut off by a hot reload between
// the write and the point where its path is handed on must not take a file that is still in use with it
// (that left the chip pointing at a deleted path). pruneArt does the cleaning, later.
export async function writeArt(prefix, svg) {
  const dir = `${appHome()}/data/usage`;
  const name = `${prefix}-${Date.now().toString(36)}${(serial++ % 36).toString(36)}.svg`;
  const r = await exec("sh", ["-c", 'mkdir -p "$1" && printf "%s" "$2" > "$1/$3" && test -s "$1/$3"', "sh", dir, svg, name]);
  if (r.code !== 0) throw new Error(firstLine(r.stderr) || "couldn't write the picture");
  return `data/usage/${name}`;
}

const baseName = (file) => file.slice(file.lastIndexOf("/") + 1);

// Removes the drawn files of one kind that nothing shows any more: not in `keep` (paths as handed out by
// writeArt) and older than five minutes (a copy that has not redrawn yet may still show the one before).
export async function pruneArt(prefix, keep) {
  const dir = `${appHome()}/data/usage`;
  const script = 'cd "$1" 2>/dev/null || exit 0; p=$2; shift 2; for f in "$p"-*.svg; do [ -e "$f" ] || continue; for k in "$@"; do [ "$f" = "$k" ] && continue 2; done; [ -n "$(find "$f" -mmin +5 2>/dev/null)" ] && rm -f "$f"; done; exit 0';
  try { await exec("sh", ["-c", script, "sh", dir, prefix, ...keep.map(baseName)]); } catch (_) { /* the next one tries again */ }
}

// Whether a path from writeArt is still there.
export async function artExists(file) {
  try { return (await exec("test", ["-f", `${appHome()}/${file}`])).code === 0; } catch (_) { return true; }
}

// The panel's picture: render.mjs runs art.js's panelSvg in JavaScriptCore's shell (part of macOS), and the
// SVG goes to data/usage/ like the chip's. Resolves with { file, w, h, hits }; rejects with a one-line reason.
// jsc prints an uncaught exception on stdout and exits 3.
const JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc";
export async function drawPanel(input) {
  let r;
  try {
    r = await exec(JSC, ["-m", `${appHome()}/mods/usage/render.mjs`, "--", JSON.stringify(input)]);
  } catch (e) {
    throw new Error(/cannot (?:start|run)|ENOENT|not found/i.test(String(e?.message)) ? "JavaScriptCore's jsc isn't on this Mac" : reason(e));
  }
  if (r.code !== 0) throw new Error(firstLine(r.stdout).replace(/^Exception:\s*/, "") || firstLine(r.stderr) || `jsc exited with ${r.code}`);
  const art = JSON.parse(r.stdout);
  return { file: await writeArt("panel", art.svg), w: art.w, h: art.h, hits: art.hits };
}

// The status bar's chip: `shared("omp.chip")` = { file, w, h, tip, compact: { file, w, h } }. `file` is the
// gauge and each Anthropic account's tightest window (`Personal 23% · Margins 0%`); `compact` leaves the
// names out (a narrow bar). The tip is one line per account, every window.
async function drawChip(providers, error) {
  try {
    const chip = chipSvg({ providers, error, t: theme() });
    if (!chip) { setShared("omp.chip", null); return; }
    const tip = providers.flatMap((p) => p.accounts.map((a) => `${p.id === "anthropic" ? "" : `${p.name} `}${a.title}: ${a.windows.map((w) => `${w.label} ${Math.round(w.f * 100)}%`).join(" · ")}`)).join("\n");
    const full = await writeArt("chip", chip.full.svg), compact = await writeArt("chip", chip.compact.svg);
    setShared("omp.chip", {
      file: full, w: chip.full.w, h: chip.full.h, tip: `${tip}${error ? "\n(stale)" : ""}`,
      compact: { file: compact, w: chip.compact.w, h: chip.compact.h },
    });
    await pruneArt("chip", [full, compact]);
  } catch (_) { /* the chip is a nicety */ }
}

// A chip whose files went missing (a cleaned data folder) is drawn again from the answer it was made from.
export async function ensureChip() {
  const chip = shared("omp.chip"), d = usage();
  if (!d?.providers?.some((p) => p.accounts.some((a) => a.windows.length))) return; // nothing to draw, and drawChip would only write null again
  if (chip?.file && chip.compact?.file && (await artExists(chip.file)) && (await artExists(chip.compact.file))) return;
  await drawChip(d.providers, d.error ?? null);
}

// ── omp usage ────────────────────────────────────────────────

// The accounts omp may use: the allow-list .zshrc gives every omp (OMP_AUTH_BROKER_ACCOUNT_POOL_FILE), which
// the app's own environment doesn't have. Without it the broker lists accounts left out on purpose.
const POOLED = 'f="$HOME/.omp/agent/account-pool.json"; [ -f "$f" ] && export OMP_AUTH_BROKER_ACCOUNT_POOL_FILE="$f"; exec omp usage --json';

async function fetchUsage(started) {
  const prev = usage();
  try {
    // The priorities come with it; a policy read that fails only leaves every account at 0.
    const [r, pol] = await Promise.all([
      exec("sh", ["-c", POOLED]),
      exec("omp", ["config", "get", "auth.accountPolicies", "--json"]).catch(() => null),
    ]);
    if (r.code !== 0) throw new Error(firstLine(r.stderr) || firstLine(r.stdout) || `omp usage exited with ${r.code}`);
    const json = jsonOf(r.stdout);
    let policies = [];
    try { if (pol?.code === 0) policies = jsonOf(pol.stdout).value ?? []; } catch (_) { /* priority 0 for all */ }
    const providers = normalizeUsage(json, policies);
    setShared("omp.usage", {
      at: Date.now(), tried: started, ms: Date.now() - started, providers,
      loose: (json.accountsWithoutUsage ?? []).map((a) => ({ provider: a.provider, type: a.type })),
    });
    await drawChip(providers, null);
    return false;
  } catch (e) {
    const msg = /cannot (?:start|run) omp\b|ENOENT/i.test(String(e?.message)) ? "omp isn't installed on this Mac" : reason(e);
    const error = { at: Date.now(), message: msg };
    setShared("omp.usage", { ...(prev ?? { providers: [], loose: [] }), tried: started, error });
    if (prev?.providers?.length) await drawChip(prev.providers, error);
    return true;
  }
}

// One report is one account's own limits: no pooling. Priority comes from omp's account policies (higher is
// tried first; no policy is 0). Windows run shortest first, a metered tier (Fable) after its plain one.
//   providers: [{ id, name, accounts: [{ key, title, short, email, org, team, priority,
//                 windows: [{ key, label, meter, f, reset, durationMs }] }] }]
// `team` is an org with a name of its own (titled with it; a second member of it adds their email's local
// part); a personal org is `<email>'s Organization` (`Personal` when that email also has a team org, else
// the email's local part).
const PERSONAL_ORG = /'s Organization$/i;
const localPart = (email) => String(email ?? "").split("@")[0];

function windowsOf(r) {
  // A provider with one meter (codex `chat`) names it on the account, not on each limit.
  const meters = Object.keys(r.metadata?.meterStates ?? {});
  return (r.limits ?? []).map((l) => {
    const tier = l.scope?.tier ?? null, id = l.window?.id ?? l.id;
    return {
      key: `${id}${tier ? `:${tier}` : ""}`,
      label: `${id}${tier === "fable" ? " Fable" : ""}`,
      meter: tier ? (tier === "fable" ? null : tier) : (meters.length === 1 ? meters[0] : null),
      f: Math.min(1, Math.max(0, l.amount?.usedFraction ?? 0)),
      reset: l.window?.resetsAt ?? null,
      durationMs: l.window?.durationMs ?? 0,
    };
  }).sort((a, b) => a.durationMs - b.durationMs || Number(Boolean(a.meter)) - Number(Boolean(b.meter)) || (a.key < b.key ? -1 : 1));
}

export function normalizeUsage(json, policies = []) {
  const priorityOf = (provider, email, orgId) => {
    const same = (p) => p.provider === provider && String(p.account?.email ?? "").toLowerCase() === String(email ?? "").toLowerCase();
    return (policies.find((p) => same(p) && p.account?.orgId === orgId) ?? policies.find((p) => same(p) && !p.account?.orgId))?.priority ?? 0;
  };
  const byProvider = {};
  for (const r of json.reports ?? []) (byProvider[r.provider] ??= []).push(r);
  const out = [];
  for (const [id, reports] of Object.entries(byProvider)) {
    const org = (r) => r.metadata?.orgName ?? null;
    const isTeam = (r) => Boolean(org(r)) && !PERSONAL_ORG.test(org(r));
    const teamEmails = new Set(reports.filter(isTeam).map((r) => r.metadata?.email));
    const accounts = reports.map((r) => {
      const email = r.metadata?.email ?? null, orgId = r.metadata?.orgId ?? null, team = isTeam(r);
      return {
        key: `${id}:${email ?? ""}:${orgId ?? ""}`,
        title: team ? org(r) : teamEmails.has(email) ? "Personal" : localPart(email) || "Account",
        short: null, email, org: org(r), team, priority: priorityOf(id, email, orgId), windows: windowsOf(r),
      };
    });
    accounts.sort((a, b) => b.priority - a.priority || String(a.email).localeCompare(String(b.email)) || a.title.localeCompare(b.title));
    // Two members of one team org share its name: the first by priority keeps it, the others add their email's local part.
    // `byEmail`: titles that are an email's own, which the status bar cannot afford whole.
    const seen = new Set(), taken = new Set(), byEmail = [];
    for (const a of accounts) {
      const dup = seen.has(a.title);
      seen.add(a.title);
      if (dup) a.title = `${a.title} · ${localPart(a.email)}`;
      if (dup || (!a.team && a.title !== "Personal")) byEmail.push(a);
      else { a.short = a.title; taken.add(a.title.toLowerCase()); }
    }
    // short: an email's local part gives its first word (`jane.doe` → `jane`), or its last when the
    // first is taken (`margins.leads` → `leads`, the team being `Margins`).
    for (const a of byEmail) {
      const local = localPart(a.email), words = local.split(/[._+-]+/).filter(Boolean);
      a.short = [words[0], words.at(-1), local, a.title].find((c) => c && !taken.has(c.toLowerCase()));
      taken.add(a.short.toLowerCase());
    }
    out.push({ id, name: NAMES[id] ?? id, accounts });
  }
  out.sort((a, b) => (a.id === "anthropic" ? -1 : b.id === "anthropic" ? 1 : a.name.localeCompare(b.name)));
  return out;
}

// ── omp stats ────────────────────────────────────────────────

// Runs where the session files are (this Mac, or a machine from machines()). Read-only: it opens
// stats.db with mode=ro, after `omp stats --json` has synced the session files into it.
const HIST = `
import sqlite3, json, os, sys, time
D, H = 24 * 3600000, 3600000
off = int(sys.argv[1])
now = int(time.time() * 1000)
t0 = (now + off) // D * D - off
c = sqlite3.connect("file:%s?mode=ro" % os.path.expanduser("~/.omp/stats.db"), uri=True, timeout=5)
K = ["req", "failed", "in", "out", "cr", "cw", "cost", "cached", "nocache", "ttftSum", "ttftN", "tpsSum", "tpsN"]
S = "TOTAL(requests), TOTAL(failed), TOTAL(input_tokens), TOTAL(output_tokens), TOTAL(cache_read_tokens), TOTAL(cache_write_tokens), TOTAL(cost_total), TOTAL(cached_prompt_cost), TOTAL(no_cache_input_cost), TOTAL(ttft_sum), TOTAL(ttft_n), TOTAL(tps_sum), TOTAL(tps_n), MIN(first_ts), MAX(last_ts)"
def q(sql, *a):
    return c.execute(sql, a).fetchall()
def rng(since):
    w, a = ("WHERE bucket >= ?", (since,)) if since is not None else ("", ())
    r = q("SELECT %s FROM message_rollup %s" % (S, w), *a)[0]
    o = dict(zip(K, r))
    o["first"], o["last"] = r[13], r[14]
    m = [dict(model=x[0], provider=x[1], cost=x[2], req=x[3], out=x[4]) for x in q("SELECT model, provider, TOTAL(cost_total), TOTAL(requests), TOTAL(output_tokens) FROM message_rollup %s GROUP BY model, provider ORDER BY 3 DESC LIMIT 12" % w, *a)]
    f = [dict(folder=x[0], cost=x[1], req=x[2]) for x in q("SELECT folder, TOTAL(cost_total), TOTAL(requests) FROM message_rollup %s GROUP BY folder ORDER BY 2 DESC LIMIT 12" % w, *a)]
    return dict(o=o, models=m, folders=f)
h0 = now // H * H
hours = {x[0]: x for x in q("SELECT bucket, TOTAL(cost_total), TOTAL(output_tokens), TOTAL(requests) FROM message_rollup WHERE bucket >= ? GROUP BY bucket", h0 - 23 * H)}
days = {x[0]: x for x in q("SELECT (bucket + ?) / ? AS d, TOTAL(cost_total), TOTAL(output_tokens), TOTAL(requests) FROM message_rollup WHERE bucket >= ? GROUP BY d", off, D, t0 - 29 * D)}
d0 = (now + off) // D
print(json.dumps(dict(
    t0=t0, now=now,
    ranges=dict(today=rng(t0), d7=rng(t0 - 6 * D), d30=rng(t0 - 29 * D), all=rng(None)),
    hours=[[h0 - i * H] + list(hours.get(h0 - i * H, (0, 0, 0, 0))[1:]) for i in range(23, -1, -1)],
    days=[[(d0 - i) * D - off] + list(days.get(d0 - i, (0, 0, 0, 0))[1:]) for i in range(29, -1, -1)],
), separators=(",", ":")))
`;

const tzOffset = () => -new Date().getTimezoneOffset() * 60000;

async function statsOn(on) {
  const t0 = Date.now();
  const sync = await exec("omp", ["stats", "--json"], { on });
  if (sync.code !== 0) throw new Error(firstLine(sync.stderr.replace(/^Syncing session files\.\.\.$/m, "")) || `omp stats exited with ${sync.code}`);
  const t1 = Date.now();
  const r = await exec("python3", ["-c", HIST, String(tzOffset())], { on });
  if (r.code !== 0) throw new Error(firstLine(r.stderr.split("\n").filter(Boolean).pop()) || `python3 exited with ${r.code}`);
  const h = jsonOf(r.stdout);
  return { at: Date.now(), ms: { sync: t1 - t0, hist: Date.now() - t1 }, ranges: h.ranges, hours: h.hours, days: h.days };
}

function statsError(e, on) {
  const msg = String(e?.message ?? e);
  if (/cannot (?:start|run) (omp|python3)\b|ENOENT|not found/i.test(msg)) return `${/python3/.test(msg) ? "python3" : "omp"} isn't installed${on ? ` on ${on}` : ""}`;
  if (/no such table|unable to open|no such file/i.test(msg)) return `no omp stats yet${on ? ` on ${on}` : ""}`;
  return reason(e);
}

async function fetchStats(started) {
  const prev = stats();
  const ready = machines().filter((m) => m.name);
  const targets = [{ key: "local", on: null }, ...ready.filter((m) => m.layout === "ready").map((m) => ({ key: m.name, on: m.name }))];
  const results = await Promise.all(targets.map(async ({ key, on }) => {
    try {
      return [key, await statsOn(on)];
    } catch (e) {
      return [key, { ...(prev?.machines?.[key] ?? {}), error: { at: Date.now(), message: statsError(e, on) } }];
    }
  }));
  const machinesNow = Object.fromEntries(results);
  // A machine that is away keeps its last answer, marked stale.
  for (const m of ready) {
    if (!machinesNow[m.name]) machinesNow[m.name] = { ...(prev?.machines?.[m.name] ?? {}), error: { at: Date.now(), message: `${m.name} is offline` } };
  }
  const failed = Object.values(machinesNow).some((m) => m.error);
  setShared("omp.stats", { at: Date.now(), tried: started, machines: machinesNow });
  return failed;
}

// Machines with an answer, this one first, then by name: [{ key, label, m }].
export function machineList(s) {
  const here = win()?.platform === "macos" ? "This Mac" : "This computer";
  return Object.entries(s?.machines ?? {})
    .filter(([, m]) => m.ranges)
    .sort(([a], [b]) => (a === "local" ? -1 : b === "local" ? 1 : a.localeCompare(b)))
    .map(([key, m]) => ({ key, label: key === "local" ? here : key, m }));
}
