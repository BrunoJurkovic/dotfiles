// Source: ~/.dotfiles/herdr-app/.config/herdr-app/lib/state.js (copied in by herdr-reload; edit there).
// Agent state, one shape per state as on sketchybar: blocked ⊗ red, done ✓ green, working ◐ blue (spins
// natively), idle ○ overlay0. Colour never tells a state alone. stateMark(mod, status, size) is the only
// way a mod draws one; the SVGs sit beside this file (state-blocked / done / working / idle), so a mod
// passes its own name: they resolve as mods/<mod>/lib/state-<status>.svg.

import { svg } from "gpui-kit";
import { theme } from "herdr";
import { worked, ago } from "./time.js";

export const STATES = ["blocked", "done", "working", "idle"];
// Most urgent first: blocked > done > working > idle.
export const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// The words, lowercase inline; a heading says them in Title case.
export const WORD = { blocked: "needs you", done: "finished", working: "working", idle: "idle" };

export const stateSvg = (mod, status) => `mods/${mod}/lib/state-${status}.svg`;

// The state's colour. Idle is overlay0, a null status (a plain shell) is dim.
export function stateColor(status, t = theme()) {
  return status === "blocked" || status === "done" || status === "working" ? t[status] : status === "idle" ? t.idle ?? t.dim : t.dim;
}

// The more urgent of two statuses (null counts as nothing).
export const urgent = (a, b) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);

// The state's mark at `size` px: 14 in lists and the bar, 12 inline and in the status bar.
// working spins natively (900 ms); `{ still: true }` draws it static (a rail badge, the status bar).
// A null status, a plain shell with no agent, is terminal.svg in dim.
export function stateMark(mod, status, size = 14, { still = false, t = theme() } = {}) {
  if (!(status in RANK)) return svg("mods/workspace-chrome/terminal.svg").size(size).flex_none().text_color(t.dim);
  const mark = svg(stateSvg(mod, status)).size(size).flex_none().text_color(stateColor(status, t));
  return status === "working" && !still ? mark.spin(900) : mark;
}

// The one time worth showing next to a state, as text: working → how long it has been working; blocked or
// done → how long it has waited (the oldest tab in that state); idle → null. `item` is a space or
// { status, tabs } with TabInfo tabs. Draw it in MONO 11 in the state's colour.
export function stateTime(item, now = Date.now()) {
  if (item.status === "working") {
    const since = item.tabs.map((c) => c.working_since).filter((s) => s != null);
    return since.length ? worked(now - Math.min(...since)) : null;
  }
  if (item.status === "blocked" || item.status === "done") {
    const at = item.tabs.filter((c) => c.status === item.status && c.changed_at != null).map((c) => c.changed_at);
    return at.length ? ago(now - Math.min(...at)) : null;
  }
  return null;
}
