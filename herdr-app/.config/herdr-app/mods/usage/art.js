// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/usage (copied in by herdr-reload; edit there).
// Everything the usage panel's body and the status bar's chip show is drawn here, as SVG text. Each native
// element costs Herdr about 0.6 ms to build, so a panel of meters, strips and rows (hundreds of elements)
// is too slow to render; as one image it is a single element. The mod writes the SVG to data/usage/ and
// shows it with image(). Pure functions: no element builders, no host calls, no `herdr` import. The chip is
// drawn in Herdr; the panel is drawn by macOS's JavaScriptCore shell (render.mjs, data.js drawPanel).
//
// The look is the shared one (lib/tokens.js): flat sections under 1 px hairlines inside the panel card,
// 11 / 12 / 13 type in SF Pro with Geist Mono for digits, weights 400 / 500 / 600, the island recipe for the
// range picker, the chip recipe for counts and stale marks. Levels are accent below 80 %, yellow from 80,
// red from 90: never green or peach (green is finished, peach is another machine).
import {
  RANGES, combine, series, modelName, cacheRate, cacheSavings, errorRate, avgTtft, avgTps,
  usd, count, int, percent, resetText, clock, dayLabel, weekday, staleText,
} from "./fmt.js";
import { T, MAC, MONO, PEACH, tint, shades } from "./lib/tokens.js";

const SANS = "SF Pro Text, SF Pro, -apple-system, sans-serif";
const MONOF = `${MONO}, Menlo, monospace`;
const PAD = 16, COLGAP = 24;
export const WARN = 0.8, CRIT = 0.9;

// How much of a limit is used: accent, then yellow, then red. The status bar's own thresholds.
export const level = (f, t) => (f >= CRIT ? t.blocked : f >= WARN ? MAC.yellow : t.accent);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v) => Math.round(v * 100) / 100;

// A colour as an SVG paint: #rrggbb plus the alpha of an #rrggbbaa as its own attribute.
function paint(attr, color, extra = 1) {
  const a = (color.length >= 9 ? parseInt(color.slice(7, 9), 16) / 255 : 1) * extra;
  return `${attr}="${color.slice(0, 7)}"${a < 0.995 ? ` ${attr}-opacity="${n(a)}"` : ""}`;
}

// Text widths are guessed, not measured: enough to truncate a name before it meets the number beside it.
const THIN = "iljtfI.,:;'|!()[]/\\ ·";
const WIDE = "mwMW@%";
const tw = (s, size) => {
  let w = 0;
  for (const ch of String(s)) w += THIN.includes(ch) ? 0.3 : WIDE.includes(ch) ? 0.86 : ch >= "0" && ch <= "9" ? 0.58 : ch >= "A" && ch <= "Z" ? 0.66 : 0.53;
  return w * size;
};
const mw = (s, size) => String(s).length * 0.6 * size;
function fit(s, max, size) {
  s = String(s);
  if (tw(s, size) <= max) return s;
  while (s.length > 1 && tw(`${s}…`, size) > max) s = s.slice(0, -1);
  return `${s}…`;
}
function wrap(s, max, size) {
  const lines = [];
  let line = "";
  for (const word of String(s).split(/\s+/)) {
    if (line && tw(`${line} ${word}`, size) > max) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

// ── Primitives (k: the drawing context: theme roles, width, now, range, out, hits) ──

// Text on baseline y. `mono` is the digits' face; `size` 11 / 12 / 13; `weight` 400 / 500 / 600.
function tx(k, x, y, s, o = {}) {
  const { size = T.small, fill = k.t.foreground, weight = 400, anchor, mono } = o;
  return `<text x="${n(x)}" y="${n(y)}"${mono ? ` font-family="${MONOF}"` : ""} font-size="${size}"${weight !== 400 ? ` font-weight="${weight}"` : ""}${anchor ? ` text-anchor="${anchor}"` : ""} ${paint("fill", fill)}>${esc(s)}</text>`;
}
// A run of text in one baseline, parts of [text, { mono, fill, weight }]: the summary line mixes faces.
function runs(k, x, y, size, parts) {
  const spans = parts.map(([s, o = {}]) => `<tspan${o.mono ? ` font-family="${MONOF}"` : ""}${o.weight ? ` font-weight="${o.weight}"` : ""} ${paint("fill", o.fill ?? k.t.foreground)}>${esc(s)}</tspan>`);
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" xml:space="preserve">${spans.join("")}</text>`;
}
const rect = (x, y, w, h, r, color, extra = "") => `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(h)}" rx="${n(Math.min(r, h / 2, Math.max(0, w) / 2))}" ${paint("fill", color)}${extra}/>`;
const put = (k, s) => { k.out.push(s); };

// The meter: a track and its fill (never thinner than a dot, so a little use shows).
function capsule(k, x, y, w, h, frac, color) {
  const fw = frac > 0 ? Math.min(w, Math.max(h, w * frac)) : 0;
  put(k, rect(x, y, w, h, h / 2, k.t.raised) + (fw ? rect(x, y, fw, h, h / 2, color) : ""));
}

// Chip: h 18, px 8, radius 9, 11/500, no border. A tone tints it (15 % fill, tone text); none is the
// neutral chip (raised, muted). Right edge at xr, centred on cy.
function chip(k, xr, cy, label, tone) {
  const w = tw(label, T.meta) + 16, x = xr - w;
  put(k, rect(x, cy - 9, w, 18, 9, tone ? tint(tone) : k.t.raised));
  put(k, tx(k, x + w / 2, cy + 3.9, label, { size: T.meta, weight: 500, fill: tone ?? k.t.muted, anchor: "middle" }));
  return w;
}

const rule = (k, x, y, w) => put(k, `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="1" ${paint("fill", k.t.border)}/>`);
// Loading blocks: raised at 40 %, radius 8.
const ghost = (k, x, y, w, h) => put(k, `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${Math.min(8, h / 2)}" ${paint("fill", k.t.raised, 0.4)}/>`);

const pctText = (f) => (f > 0 && f < 0.005 ? "<1%" : `${Math.round(f * 100)}%`);

// A section's top: the hairline (not on the first), then its label row (11/500 dim, h 28) with an optional
// stale chip at the far end. Returns where the content starts.
function begin(k, x, y, w, label, first, stale) {
  let top = y;
  if (!first) { rule(k, x, y, w); top += 5; }
  put(k, tx(k, x, top + 18, label, { size: T.meta, weight: 500, fill: k.t.dim }));
  if (stale) chip(k, x + w, top + 14, stale, MAC.yellow);
  return top + 28;
}
const SECTION_END = 16;

// A plain notice inside a section: a title and the reason, wrapped.
function note(k, x, y, w, title, text) {
  put(k, tx(k, x, y + 13, title, { size: T.small, weight: 500, fill: k.t.muted }));
  let h = 20;
  for (const line of wrap(text, w, T.meta)) { put(k, tx(k, x, y + h + 10, line, { size: T.meta, fill: k.t.dim })); h += 15; }
  return h;
}

// ── Limits ───────────────────────────────────────────────────

// One window of one account: label, its own meter and percentage, when it resets beneath. A window at 0 %
// is one muted line. Returns the row's height.
function windowRow(k, win, x, y, w) {
  const { t } = k;
  const LBL = k.narrow ? 56 : 64, PCT = 36;
  if (win.f <= 0) {
    put(k, `<text x="${n(x)}" y="${n(y + 13)}" font-size="${T.small}" xml:space="preserve">${`<tspan font-weight="500" ${paint("fill", t.muted)}>${esc(win.label)}</tspan><tspan font-size="${T.meta}" ${paint("fill", t.dim)}>  ·  idle</tspan>`}</text>`);
    return 24;
  }
  const color = level(win.f, t), mx = x + LBL, mwid = w - LBL - PCT - 8;
  put(k, tx(k, x, y + 12, win.label, { size: T.small, weight: 500, fill: t.muted }));
  capsule(k, mx, y + 5, mwid, 6, win.f, color);
  put(k, tx(k, x + w, y + 12.2, pctText(win.f), { mono: true, size: T.small, weight: 500, fill: win.f >= WARN ? color : t.foreground, anchor: "end" }));
  const when = win.reset ? `resets ${resetText(win.reset, k.now)}` : "";
  const line = win.meter && when ? `${win.meter} · ${when}` : win.meter || when;
  if (!line) return 26;
  put(k, tx(k, mx, y + 31, fit(line, mwid, T.meta), { size: T.meta, fill: t.muted }));
  return 44;
}

// One account: its title and email, then its own windows. A tooltip over the block names the priority.
function account(k, a, x, y, w) {
  const { t } = k;
  put(k, tx(k, x, y + 13, a.title, { size: T.body, weight: 600 }));
  put(k, tx(k, x + tw(a.title, T.body) * 1.08 + 8, y + 12.6, fit(a.email ?? "", w - tw(a.title, T.body) * 1.08 - 8, T.meta), { size: T.meta, fill: t.dim }));
  let cy = y + 28;
  if (!a.windows.length) { put(k, tx(k, x, cy + 12, "No limit data", { size: T.meta, fill: t.dim })); cy += 24; }
  for (const win of a.windows) cy += windowRow(k, win, x, cy, w);
  k.hits.push({ kind: "tip", id: `acct-${a.key}`, x, y, w, h: cy - y, tip: `${a.email ?? a.title}\nPriority ${a.priority}` });
  return cy - y;
}

// One provider: its name and account count, then an account block per account in priority order. A wide panel
// has two columns: the order runs down the left one, then down the right.
function provider(k, p, x, y, w) {
  put(k, tx(k, x, y + 16, p.name, { size: T.body, weight: 600 }));
  chip(k, x + w, y + 12, p.accounts.length === 1 ? "1 account" : `${p.accounts.length} accounts`);
  const cols = k.wide ? 2 : 1, cw = (w - (cols - 1) * COLGAP) / cols, top = y + 34;
  const per = Math.ceil(p.accounts.length / cols), heights = Array(cols).fill(0);
  p.accounts.forEach((a, i) => {
    const col = Math.floor(i / per);
    heights[col] += account(k, a, x + col * (cw + COLGAP), top + heights[col], cw) + 14;
  });
  return top + Math.max(...heights) - y;
}

function limits(k, x, y, w, first) {
  const { d, t } = k;
  const stale = d?.error && d.at ? staleText(d.at, k.now) : null;
  let cy = begin(k, x, y, w, "Limits", first, stale);
  if (!d) {
    ghost(k, x, cy + 4, w, 38); ghost(k, x, cy + 50, w, 38);
    return cy + 96 + SECTION_END - y;
  }

  if (!d.at) cy += note(k, x, cy + 4, w, "Couldn't read usage limits", `${d.error?.message ?? "No answer"}. It tries again in a minute.`) + 4;
  else if (!d.providers.length) cy += note(k, x, cy + 4, w, "No usage limits", "No signed-in account reports usage limits.") + 4;
  else {
    cy += 4;
    for (const p of d.providers) cy += provider(k, p, x, cy, w) + 4;
    if (d.loose?.length) {
      put(k, tx(k, x, cy + 11, `${d.loose.map((a) => `${a.provider}${a.type === "api_key" ? " (API key)" : ""}`).join(", ")} · no limit data`, { size: T.meta, fill: t.dim }));
      cy += 20;
    }
    cy -= 18;
  }
  return cy + SECTION_END - y;
}

// ── Spend ────────────────────────────────────────────────────

// The range picker: the island recipe (h 26, radius 13; pills h 20, radius 10; the active one accent at 15 %).
function picker(k, x, y, w) {
  const { t } = k, c = shades(t), pad = 3;
  put(k, `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(w - 1)}" height="25" rx="12.5" ${paint("fill", c.island.bg)} ${paint("stroke", c.island.border)}/>`);
  const pw = (w - 2 * pad) / RANGES.length;
  RANGES.forEach(([key, text], i) => {
    const px = x + pad + i * pw, on = key === k.range;
    if (on) put(k, rect(px, y + 3, pw, 20, 10, c.active));
    put(k, tx(k, px + pw / 2, y + 17.2, text, { size: T.small, weight: 500, fill: on ? t.accent : t.muted, anchor: "middle" }));
    k.hits.push({ kind: "range", id: key, x: px, y: y + 3, w: pw, h: 20 });
  });
  return 26;
}

// The selected range in one line: cost, output tokens, cache hit; numerals in mono, words muted.
function summary(k, x, y, o) {
  const { t } = k;
  if (!o.req) { put(k, tx(k, x, y + 14, "No activity in this range", { size: T.small, fill: t.dim })); return 20; }
  const dot = [" · ", { fill: t.dim }];
  const hit = cacheRate(o);
  const parts = [[usd(o.cost), { mono: true, weight: 500 }], dot, [count(o.out), { mono: true, weight: 500 }], [" tokens out", { fill: t.muted }]];
  if (hit != null) parts.push(dot, [hit >= 0.9995 ? "100%" : percent(hit, hit > 0.99 ? 1 : 0), { mono: true, weight: 500 }], [" cache hit", { fill: t.muted }]);
  put(k, runs(k, x, y + 14.6, T.body, parts));
  return 20;
}

// A column strip: the title and its peak above, bars between, one axis line below. Today shows the last 24
// hours, 7 days the last 7 days (each bar named), 30 days and all time the last 30 days.
function strip(k, x, y, w, rows, title, peakText, axis) {
  const { t } = k;
  const H = 36, top = y + 22;
  put(k, tx(k, x, y + 14, title, { size: T.meta, fill: t.muted }));
  if (peakText) put(k, tx(k, x + w, y + 14, peakText, { size: T.meta, fill: t.dim, anchor: "end" }));
  const m = rows.length;
  if (!m) return 22 + H;
  const bw = Math.min(m > 24 ? 4 : m > 7 ? 6 : 18, (w - (m - 1) * 2) / m);
  const gap = m > 1 ? (w - m * bw) / (m - 1) : 0;
  const max = Math.max(0, ...rows.map((r) => r[1]));
  const xs = rows.map((_, i) => x + i * (bw + gap));
  rows.forEach((r, i) => {
    const bh = r[1] > 0 ? Math.max(3, (r[1] / max) * H) : 1;
    put(k, `<rect x="${n(xs[i])}" y="${n(top + H - bh)}" width="${n(bw)}" height="${n(bh)}" rx="${n(Math.min(2, bw / 2))}" ${paint("fill", r[1] > 0 ? t.accent : t.border, r[1] > 0 && i !== m - 1 ? 0.5 : 1)}/>`);
  });
  const ay = top + H + 14;
  if (axis.names) rows.forEach((r, i) => put(k, tx(k, xs[i] + bw / 2, ay, axis.names(r[0]), { size: T.meta, fill: i === m - 1 ? t.muted : t.dim, anchor: "middle" })));
  else {
    put(k, tx(k, x, ay, axis.from(rows[0][0]), { mono: axis.mono, size: T.meta, fill: t.dim }));
    put(k, tx(k, x + w, ay, axis.to, { size: T.meta, fill: t.dim, anchor: "end" }));
  }
  return 22 + H + 18;
}

function activity(k, x, y, w, list) {
  const peak = (rows) => rows.reduce((b, r) => (r[1] > (b?.[1] ?? 0) ? r : b), null);
  if (k.range === "today") {
    const rows = series(list, "hours", 24), p = peak(rows);
    return strip(k, x, y, w, rows, "Last 24 hours", p ? `peak ${usd(p[1])} at ${clock(p[0])}` : "", { from: clock, to: "now", mono: true });
  }
  if (k.range === "d7") {
    const rows = series(list, "days", 7), p = peak(rows);
    return strip(k, x, y, w, rows, "Last 7 days", p ? `peak ${usd(p[1])} on ${weekday(p[0])}` : "", { names: weekday });
  }
  const rows = series(list, "days", 30), p = peak(rows);
  return strip(k, x, y, w, rows, "Last 30 days", p ? `peak ${usd(p[1])} on ${dayLabel(p[0])}` : "", { from: dayLabel, to: "today" });
}

// Six facts in a grid, labels 11 dim, values mono 13/500.
function facts(k, x, y, w, o) {
  const { t } = k;
  const err = errorRate(o), tps = avgTps(o), ttft = avgTtft(o);
  const cells = [
    ["Requests", int(o.req)],
    ["Errors", percent(err, err != null && err < 0.1 ? 1 : 0), err > 0.05 ? t.blocked : err > 0.02 ? MAC.yellow : null],
    ["Cache read", count(o.cr)],
    ["Cache saved", percent(cacheSavings(o), 0)],
    ["Speed", tps == null ? "–" : `${Math.round(tps)} tok/s`],
    ["First token", ttft == null ? "–" : ttft < 1000 ? `${Math.round(ttft)} ms` : `${(ttft / 1000).toFixed(1)} s`],
  ];
  const cols = w >= 280 ? 3 : 2, cw = w / cols;
  cells.forEach(([label, value, color], i) => {
    const cx = x + (i % cols) * cw, cy = y + Math.floor(i / cols) * 42;
    put(k, tx(k, cx, cy + 11, label, { size: T.meta, fill: t.dim }));
    put(k, tx(k, cx, cy + 30, value, { mono: true, size: T.body, weight: 500, fill: color ?? t.foreground }));
  });
  return Math.ceil(cells.length / cols) * 42 - 8;
}

// Ranked rows h 26: name, cost, share. No bars: the order is the rank and the share is a number. At most
// 5, then a `+N more` link (it opens the rest, up to 12).
function ranked(k, x, y, w, id, title, rows, total, name, dot) {
  const { t } = k;
  const open = Boolean(k.more?.[id]);
  const shown = rows.slice(0, open ? 12 : 5), left = rows.length - 5;
  let cy = begin(k, x, y, w, title, false);
  if (!shown.length) { put(k, tx(k, x, cy + 17, "No activity in this range", { size: T.small, fill: t.dim })); cy += 26; }
  const lead = dot ? 14 : 0;
  for (const r of shown) {
    const mid = cy + 13;
    if (dot) put(k, `<circle cx="${n(x + 3)}" cy="${n(mid)}" r="3" ${paint("fill", dot(r))}/>`);
    put(k, tx(k, x + lead, mid + 4.2, fit(name(r), w - lead - 40 - 52 - 8, T.small), { size: T.small, weight: 500 }));
    put(k, tx(k, x + w - 40, mid + 4.2, usd(r.cost), { mono: true, size: T.small, anchor: "end" }));
    put(k, tx(k, x + w, mid + 4.2, pctText(total > 0 ? r.cost / total : 0), { mono: true, size: T.meta, fill: t.dim, anchor: "end" }));
    cy += 26;
  }
  if (left > 0) {
    const text = open ? "Show less" : `+${left} more`;
    put(k, tx(k, x, cy + 15, text, { size: T.meta, weight: 500, fill: t.muted }));
    k.hits.push({ kind: "more", id, x: x - 6, y: cy + 2, w: tw(text, T.meta) + 12, h: 20 });
    cy += 24;
  }
  return cy + SECTION_END - y;
}

// This Mac muted, every other machine peach (the first full, the rest at 70 % and 50 %).
const machineColor = (k, e, i) => (e.key === "local" ? k.t.muted : tint(PEACH, i <= 1 ? 1 : i === 2 ? 0.7 : 0.5));

function machines(k, x, y, w, list) {
  const { t } = k;
  const rows = list.map((e) => ({ e, o: e.m.ranges[k.range].o }));
  const total = rows.reduce((sum, r) => sum + r.o.cost, 0);
  let cy = begin(k, x, y, w, "Machines", false);
  rows.forEach((r, i) => {
    const mid = cy + 13;
    put(k, tx(k, x, mid + 4.2, r.e.label, { size: T.small, weight: 500, fill: machineColor(k, r.e, i) }));
    if (r.e.m.error) chip(k, x + tw(r.e.label, T.small) + 8 + tw("stale", T.meta) + 16, mid, "stale", MAC.yellow);
    put(k, tx(k, x + w - 40, mid + 4.2, usd(r.o.cost), { mono: true, size: T.small, anchor: "end" }));
    put(k, tx(k, x + w, mid + 4.2, total > 0 ? pctText(r.o.cost / total) : "–", { mono: true, size: T.meta, fill: t.dim, anchor: "end" }));
    cy += 26;
  });
  return cy + SECTION_END - y;
}

// The picker, the range's one line, the strip and the facts: the spend section's own part.
function spendHead(k, x, y, w, c, list, stale) {
  let cy = begin(k, x, y, w, "Spend", false, stale) + 4;
  cy += picker(k, x, cy, w) + 12;
  cy += summary(k, x, cy, c.o);
  if (c.o.req) {
    cy += 12;
    cy += activity(k, x, cy, w, list) + 14;
    cy += facts(k, x, cy, w, c.o);
  }
  return cy + SECTION_END - y;
}

function spendGhost(k, x, y, w) {
  let cy = begin(k, x, y, w, "Spend", false);
  ghost(k, x, cy + 4, w, 26); ghost(k, x, cy + 42, w * 0.7, 14); ghost(k, x, cy + 70, w, 64); ghost(k, x, cy + 146, w, 40);
  return cy + 196 + SECTION_END - y;
}

// What the numbers are, and how long they took to get (so a slow fetch is no mystery).
function footnote(k, x, y, w, d, s) {
  const parts = ["Costs are API-equivalent estimates from omp's session logs."];
  const times = [];
  if (d?.ms) times.push(`limits ${(d.ms / 1000).toFixed(1)} s`);
  for (const [key, m] of Object.entries(s?.machines ?? {})) {
    if (m.ms) times.push(`${key === "local" ? "Mac" : key} ${((m.ms.sync + m.ms.hist) / 1000).toFixed(1)} s`);
  }
  if (times.length) parts.push(`Fetched: ${times.join(" · ")}.`);
  const lines = wrap(parts.join(" "), w, T.meta);
  lines.forEach((l, i) => put(k, tx(k, x, y + 12 + i * 15, l, { size: T.meta, fill: k.t.dim })));
  return lines.length * 15 + 4;
}

// ── The panel ────────────────────────────────────────────────

// in: { t (theme roles), W (the width it is drawn at), now, range, more, repoColors, d (omp.usage), s (omp.stats),
//       list (machineList) }
// out: { svg, w, h, hits: [{ kind: "range" | "more" | "tip", id, x, y, w, h, tip? }] }
export function panelSvg(inp) {
  const { d, s, list, W } = inp;
  const k = { ...inp, out: [], hits: [], wide: W >= 640, narrow: W < 330 };
  const inner = W - 2 * PAD;
  let y = 4;
  y += limits(k, PAD, y, inner, true);
  const statsError = s ? Object.values(s.machines ?? {}).find((m) => m.error)?.error : null;
  const stale = statsError && s.at ? staleText(s.at, k.now) : null;
  if (!s) y += spendGhost(k, PAD, y, inner);
  else if (!list.length) {
    const why = Object.values(s.machines ?? {}).map((m) => m.error?.message).find(Boolean);
    const cy = begin(k, PAD, y, inner, "Spend", false, stale);
    y = cy + note(k, PAD, cy + 4, inner, "No spend yet", why ? `omp stats: ${why}` : "omp hasn't recorded any sessions.") + 4 + SECTION_END;
  } else {
    const c = combine(list.map((e) => e.m.ranges[k.range]));
    const model = (x, yy, w) => ranked(k, x, yy, w, "models", "Models", c.models, c.o.cost, (m) => modelName(m.model), null);
    const repo = (x, yy, w) => ranked(k, x, yy, w, "repos", "Repos", c.repos, c.o.cost, (r) => r.name, (r) => k.repoColors?.[r.name] ?? MAC.overlay0);
    const many = list.length > 1;
    if (k.wide) {
      const cw = (inner - COLGAP) / 2, rx = PAD + cw + COLGAP;
      const top = y;
      let ly = top + spendHead(k, PAD, top, cw, c, list, stale);
      if (many) ly += machines(k, PAD, ly, cw, list);
      const ry = top + model(rx, top, cw);
      y = Math.max(ly, ry + repo(rx, ry, cw));
    } else {
      y += spendHead(k, PAD, y, inner, c, list, stale);
      y += model(PAD, y, inner);
      y += repo(PAD, y, inner);
      if (many) y += machines(k, PAD, y, inner, list);
    }
  }
  rule(k, PAD, y, inner);
  y += 8;
  y += footnote(k, PAD, y, inner, d, s) + 8;
  return { svg: wrapSvg(W, y, `<g font-family="${SANS}">${k.out.join("")}</g>`), w: W, h: y, hits: k.hits };
}

const wrapSvg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">${body}</svg>`;

// ── The status bar's chip ────────────────────────────────────

// The gauge icon (lucide, 24 grid) at 12 px.
const GAUGE = (color) => `<g transform="translate(0 2) scale(.5)" fill="none" ${paint("stroke", color)} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></g>`;

// in: { providers, error, t } out: { full, compact } each { svg, w, h }, or null when there is nothing to show.
// The Anthropic accounts (else the first provider's), in priority order. full is the gauge and, per account,
// a short name (dim) and its tightest window's percentage (muted, yellow from 80 %, red from 90) joined by
// ` · `; compact leaves the names out. On an error the numbers are old: `stale` leads and all is dim
// (compact is the gauge and `stale` alone).
export function chipSvg({ providers, error, t }) {
  const live = (providers ?? []).filter((p) => p.accounts.some((a) => a.windows.length));
  const p = live.find((x) => x.id === "anthropic") ?? live[0];
  const list = (p?.accounts ?? []).filter((a) => a.windows.length).map((a) => ({ name: fit(a.short, 72, T.meta), f: Math.max(...a.windows.map((w) => w.f)) }));
  if (!list.length) return null;
  const H = 16, SEP = 5, GAP = 4;
  const worst = Math.max(...list.map((a) => a.f));
  const make = (named) => {
    // Segments of [text, width, options]: `stale`, then one per account.
    const segs = [];
    if (error) segs.push([["stale", mw("stale", T.meta), { mono: true, weight: 500, fill: t.dim }]]);
    if (!error || named) {
      for (const a of list) {
        const pct = `${Math.round(a.f * 100)}%`, fill = error ? t.dim : a.f >= WARN ? level(a.f, t) : t.muted;
        segs.push([...(named ? [[a.name, tw(a.name, T.meta), { fill: t.dim }]] : []), [pct, mw(pct, T.meta), { mono: true, weight: 500, fill }]]);
      }
    }
    let x = 17, body = "";
    segs.forEach((seg, i) => {
      if (i) { body += tx({ t }, x + SEP, 12, "·", { size: T.meta, fill: t.dim }); x += SEP * 2 + tw("·", T.meta); }
      seg.forEach(([s, w, o], j) => { body += tx({ t }, x, 12, s, { size: T.meta, ...o }); x += w + (j < seg.length - 1 ? GAP : 0); });
    });
    const w = Math.ceil(x) + 5;
    const gauge = error ? t.dim : worst >= WARN ? level(worst, t) : t.muted;
    return { svg: wrapSvg(w, H, `<g font-family="${SANS}">${GAUGE(gauge)}${body}</g>`), w, h: H };
  };
  return { full: make(true), compact: make(false) };
}
