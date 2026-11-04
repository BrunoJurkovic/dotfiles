// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/notify-bridge (copied in by herdr-reload; edit there).
//
// notify-bridge: renders nothing. Watches every agent's status and bridges
// changes out of the window:
//
//   * a macOS notification when an agent turns blocked ("needs you") or done
//     ("finished") while Herdr is not the active window. terminal-notifier
//     first: a click brings Herdr forward on that agent. When macOS won't let it
//     post (notifications denied for it: System Settings > Notifications) the
//     same text goes through osascript, which cannot carry a click.
//   * `sketchybar --trigger herdr_agents_update` on every status change (an agent
//     moving, appearing or going away), so the menu bar's agents island follows
//     at once instead of on its poll: one trigger now, then at most one per 300 ms.
//
// The first scan only records who is in which state, so agents already blocked or
// done when this mod starts, or that show up later (a machine connecting), never
// notify: only an agent seen in another state before does.
//
// A hidden window isn't drawn, so it doesn't render either, and a hidden window is
// exactly when notifications matter: besides every render, a timer looks at the
// live agents (in memory, no exec).
import { View, div } from "gpui-kit";
import { agents, appHome, exec, home, window } from "herdr";
import { sessionName, machineOf, nameParts } from "./lib/names.js";

const NOTIFY_BODY = { blocked: "needs you", done: "finished" };
const POLL_MS = 1000;
const BAR_DEBOUNCE_MS = 300;
// What may appear in a terminal address that goes into the click command.
const SAFE_ADDRESS = /^[\w.-]+(?:\/[\w.-]+)?$/;

// The session's own name from omp's title (names.js), else the space's name, the program, the address. omp's
// icon is left out: Notification Center has no Nerd Font to draw it with.
const agentName = (a) => {
  const name = sessionName(a.title, a.app, a.program?.key, a.program?.name) || a.space_name || a.program?.name || a.address;
  const { icon, tag, text } = nameParts(name);
  return icon ? (tag ? `${tag}: ${text}` : text) : name;
};

async function post(title, body, address) {
  if (SAFE_ADDRESS.test(address)) {
    // Run on click: Herdr in front (launching it if it was closed), then that agent.
    const herdr = `${home()}/.local/bin/herdr-app`;
    const click =
      `/usr/bin/open -a Herdr; for i in $(seq 1 50); do ${herdr} status >/dev/null 2>&1 && break; sleep 0.1; done; ` +
      `${herdr} do agent.focus --terminal '${address}'`;
    try {
      // -group: a newer notification for the same agent replaces the old one.
      const r = await exec("terminal-notifier", ["-title", title, "-message", body, "-group", `herdr-${address}`, "-execute", click]);
      if (r.code === 0) return;
    } catch (_) {
      // Not installed: osascript below.
    }
  }
  await exec("osascript", [
    "-e", "on run argv",
    "-e", "display notification (item 2 of argv) with title (item 1 of argv)",
    "-e", "end run",
    title, body,
  ]);
}

export default class NotifyBridge extends View {
  init(_props, cx) {
    this.statuses = null; // address -> status at the last scan; null until the first one
    this.barPending = false; // a change arrived that no trigger has covered yet
    this.barBusy = false; // a trigger loop is running
    // Only the live app speaks to the desktop: a dev instance (another HERDR_APP_HOME)
    // runs probes whose notifications and menu-bar pokes would be noise.
    this.live = appHome().replace(/\/+$/, "") === `${home()}/.config/herdr-app`;
    if (this.live) cx.timer.every(POLL_MS, (cx) => this.scan(cx));
  }

  render(cx) {
    if (this.live) this.scan(cx);
    return div();
  }

  scan(cx) {
    const list = agents();
    const before = this.statuses;
    this.statuses = new Map(list.map((a) => [a.address, a.status]));
    if (!before) return;

    let changed = before.size !== list.length;
    const entered = [];
    for (const a of list) {
      const was = before.get(a.address);
      if (was !== a.status) changed = true;
      if (was !== undefined && was !== a.status && NOTIFY_BODY[a.status]) entered.push(a);
    }
    if (!changed) return;

    this.pokeBar(cx);
    if (entered.length === 0 || window()?.active) return;
    for (const a of entered) {
      const machine = machineOf(a.address);
      const title = agentName(a) + (machine ? ` · ${machine}` : "");
      cx.spawn(() => post(title, NOTIFY_BODY[a.status], a.address).catch((e) => console.log("notify-bridge: notification failed:", e)));
    }
  }

  // One trigger now, then no more than one per BAR_DEBOUNCE_MS: changes that
  // arrive meanwhile share the next one.
  pokeBar(cx) {
    this.barPending = true;
    if (this.barBusy) return;
    this.barBusy = true;
    cx.spawn(async (cx) => {
      try {
        while (this.barPending) {
          this.barPending = false;
          await exec("sketchybar", ["--trigger", "herdr_agents_update"]).catch((e) => console.log("notify-bridge: sketchybar:", e));
          await cx.sleep(BAR_DEBOUNCE_MS);
        }
      } finally {
        this.barBusy = false;
      }
    });
  }
}
