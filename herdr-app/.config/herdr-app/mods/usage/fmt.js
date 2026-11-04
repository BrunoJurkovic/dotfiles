// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/usage (copied in by herdr-reload; edit there).
// Pure helpers for the omp usage mod: reading the stats answers, and formatting. No `herdr` imports,
// so data.js (fetching) and art.js (drawing) can both use them.

export const DAY = 24 * 3600000;
export const HOUR = 3600000;
export const RANGES = [["today", "Today"], ["d7", "7 days"], ["d30", "30 days"], ["all", "All time"]];
const SUMS = ["req", "failed", "in", "out", "cr", "cw", "cost", "cached", "nocache", "ttftSum", "ttftN", "tpsSum", "tpsN"];

// Plain folder of a session: "-Users-bruno-Development-ciak-sfa" and "-Development-ciak-sfa" are
// both ciak-sfa; a worktree is its repo.
export function repoName(folder) {
  let s = String(folder ?? "").replace(/^\/private/, "");
  s = s.replace(/^[-/]?(?:Users|home)[-/][^-/]+/, "").replace(/^[-/]+|[-/]+$/g, "");
  if (s === "Development") return "~/Development";
  s = s.replace(/^Development-/, "").replace(/-worktrees-.+$/, "");
  if (/^tmp(-|$)/.test(s)) return "tmp";
  return s || "~";
}

export function modelName(model) {
  return String(model).replace(/^claude-/, "").replace(/^(.+)-(\d+)-(\d+)$/, "$1 $2.$3");
}

// One range across machines: raw sums (ratios come out of them, so they stay exact), models and repos merged.
export function combine(parts) {
  const o = Object.fromEntries(SUMS.map((k) => [k, 0]));
  o.first = null;
  o.last = null;
  const models = new Map(), repos = new Map();
  for (const r of parts) {
    if (!r) continue;
    for (const k of SUMS) o[k] += r.o[k] ?? 0;
    if (r.o.first != null) o.first = o.first == null ? r.o.first : Math.min(o.first, r.o.first);
    if (r.o.last != null) o.last = o.last == null ? r.o.last : Math.max(o.last, r.o.last);
    for (const m of r.models) {
      const k = `${m.provider}/${m.model}`, e = models.get(k) ?? { model: m.model, provider: m.provider, cost: 0, req: 0, out: 0 };
      e.cost += m.cost; e.req += m.req; e.out += m.out;
      models.set(k, e);
    }
    for (const f of r.folders) {
      const name = repoName(f.folder), e = repos.get(name) ?? { name, cost: 0, req: 0 };
      e.cost += f.cost; e.req += f.req;
      repos.set(name, e);
    }
  }
  const byCost = (a, b) => b.cost - a.cost;
  return { o, models: [...models.values()].filter((m) => m.req > 0).sort(byCost), repos: [...repos.values()].filter((f) => f.req > 0).sort(byCost) };
}

export const cacheRate = (o) => (o.in + o.cr > 0 ? o.cr / (o.in + o.cr) : null);
export const cacheSavings = (o) => (o.nocache > 0 ? (o.nocache - o.cached) / o.nocache : null);
export const errorRate = (o) => (o.req > 0 ? o.failed / o.req : null);
export const avgTtft = (o) => (o.ttftN > 0 ? o.ttftSum / o.ttftN : null);
export const avgTps = (o) => (o.tpsN > 0 ? o.tpsSum / o.tpsN : null);

// Hourly or daily rows ([t, cost, output tokens, requests]) summed across machines by their own
// timestamp, the newest `keep` of them: a machine that answered an hour or a day ago still lines up.
export function series(list, field, keep) {
  const by = new Map();
  for (const { m } of list) {
    for (const row of m[field] ?? []) {
      const e = by.get(row[0]) ?? [row[0], 0, 0, 0];
      for (let k = 1; k < 4; k++) e[k] += row[k] ?? 0;
      by.set(row[0], e);
    }
  }
  return [...by.values()].sort((a, b) => a[0] - b[0]).slice(-keep);
}

// ── Formatting ───────────────────────────────────────────────

export function usd(v) {
  if (!Number.isFinite(v)) return "–";
  if (v === 0) return "$0";
  if (v < 1) return `$${v.toFixed(2)}`;
  if (v < 100) return `$${v.toFixed(v < 10 ? 2 : 1)}`;
  if (v < 1000) return `$${Math.round(v)}`;
  if (v < 100000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v / 1000)}k`;
}

export function count(n) {
  if (!Number.isFinite(n)) return "–";
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 2 : n < 1e8 ? 1 : 0)}M`;
  return `${(n / 1e9).toFixed(2)}B`;
}

export const int = (n) => (Number.isFinite(n) ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "–");
export const percent = (f, digits = 0) => (f == null || !Number.isFinite(f) ? "–" : `${(f * 100).toFixed(digits)}%`);

export function ago(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// How old the last good answer is, for a chip: `stale · 3m` (just `stale` while it is under a minute).
export function staleText(ms, now = Date.now()) {
  const a = ago(ms, now);
  return a === "just now" ? "stale" : `stale · ${a.replace(" ago", "")}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n) => String(n).padStart(2, "0");

export const clock = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
export const dayLabel = (ms) => { const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export const weekday = (ms) => WEEKDAYS[new Date(ms).getDay()];

// "in 2h 14m" within a day, "Sun 18:00" within a week, "15 Nov" beyond.
export function resetText(ms, now = Date.now()) {
  const d = ms - now;
  if (d <= 60000) return "now";
  if (d < DAY) {
    const m = Math.round(d / 60000), h = Math.floor(m / 60);
    return h ? `in ${h}h ${two(m % 60)}m` : `in ${m}m`;
  }
  const dt = new Date(ms);
  if (d < 7 * DAY) return `${WEEKDAYS[dt.getDay()]} ${clock(ms)}`;
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}
