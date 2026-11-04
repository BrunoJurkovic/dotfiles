// Source: ~/.dotfiles/herdr-app/.config/herdr-app/lib/names.js (copied in by herdr-reload; edit there).
// Names: the omp session's own name from a terminal title, the icon omp puts in front of it, a folder's short
// name, a space's repo and where it works (repo · branch), and which machine an address or space is on. One
// copy for every mod.

import { home, panes } from "herdr";

// This Mac's home folder never changes: one host call, not one per space per render.
let HOME;
const here = () => (HOME ??= home());

// The session's own name from omp's terminal title (`π ⠋ fix login`, `omp: fix login`, `π > tmp`):
// drop the leading π or program name, then one state glyph (`:` or a lone symbol) and its spaces.
export function sessionName(title, ...programs) {
  const names = ["π", "omp", ...programs].filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const lead = new RegExp(`^(?:${names.join("|")})(?![\\p{L}\\p{N}_-])`, "iu");
  return (title ?? "").trim().replace(lead, "").trimStart().replace(/^(?::|\S(?=\s|$))\s*/u, "").trim();
}

// omp starts a session's title with an icon of its own, a Nerd Font glyph (private use) or an emoji, and often
// a tag in capitals: `<icon> HERDR: Sidebar polish`. The space takes that name, so the sidebar, bar and board
// split it: { icon, tag, text } (`""` for what isn't there; text is the rest, or the whole name). The icon
// draws in a Nerd Font (tokens MONO).
const ICON = /^(?:[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]|[\u{1F300}-\u{1FAFF}]\uFE0F?)(?=\s)/u;
const TAG = /^([A-Z0-9][A-Z0-9._-]{1,15}):\s+(\S.*)$/u;
export function nameParts(name) {
  let s = (name ?? "").trim(), icon = "";
  const m = ICON.exec(s);
  if (m) { icon = m[0]; s = s.slice(icon.length).trim(); }
  const t = TAG.exec(s);
  return t ? { icon, tag: t[1], text: t[2] } : { icon, tag: "", text: s };
}

// A folder's short name: `~` for a home folder (this Mac's /Users/<user>, or /home/<user>, /root elsewhere).
export function folderName(path) {
  const p = (path ?? "").replace(/\/+$/, "") || "/";
  if (/^\/(?:home|Users)\/[^/]+$/.test(p) || p === "/root") return "~";
  return p.split("/").pop() || "/";
}

// The key a folder's colour hangs on (space-colors.json, tokens accentFor): its real last segment in lower
// case, a leading dot dropped (~/.dotfiles is `dotfiles`); "" for the root.
export function colorKey(path) {
  return (path ?? "").replace(/\/+$/, "").split("/").pop().replace(/^\./, "").toLowerCase();
}

// The machine an address (`froggybox/t7`) or a space is on; null for this Mac.
export function machineOf(x) {
  if (typeof x === "string") return x.includes("/") ? x.split("/")[0] : null;
  return x?.machine ?? null;
}

// Where a space works, from its agent's terminal (else the focused, else the first): { cwd, branch, repo,
// where, roots }. `where` is `repo · branch`, leaving the repo out when the space is named after it; the
// terminal addresses of the space are `roots`. Pass panes() once when asking for many spaces.
export function placeOf(space, all = panes()) {
  const tabs = new Set(space.tabs.map((c) => c.id));
  const own = all.filter((p) => p.terminal && tabs.has(p.tab));
  const pane = own.find((p) => p.status !== null) ?? own.find((p) => p.focused) ?? own[0];
  const cwd = pane?.cwd || space.folder || "";
  const branch = pane?.branch ?? space.branch ?? "";
  const repo = cwd ? folderName(cwd) : "";
  const parts = [];
  if (repo && repo.toLowerCase() !== space.name.toLowerCase()) parts.push(repo);
  if (branch) parts.push(branch);
  const mine = here();
  // A folder-named space already says its repo: then the branch, else where it is.
  const where = parts.length ? parts.join(" · ") : cwd === mine ? "~" : cwd.startsWith(`${mine}/`) ? `~${cwd.slice(mine.length)}` : cwd;
  return { cwd, branch, repo, where, roots: own.map((p) => p.terminal) };
}

// A space's repo (the folder its agent works in), else its name: what the avatar's initial comes from.
export function repoOf(space, all) {
  const repo = placeOf(space, all).repo;
  return repo && repo !== "~" && repo !== "/" ? repo : space.name;
}
