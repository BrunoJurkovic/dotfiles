// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/session-names (copied in by herdr-reload; edit there).
// One space per omp session: names each space after its session, so the
// sidebar, picker, board, status bar and notifications say "fix login flow"
// rather than three spaces called ciak-sfa. What herdr-omp-autoname did for
// the TUI. Draws nothing: it floats, unseen, in every personal layout.
//
// A space is this mod's to name while nobody else has named it: Herdr's own
// unnamed spaces, and the ones it named itself (kept in shared
// "session-names.auto", space id -> name). Rename a space yourself (F2) and
// it stays yours. A session without a name of its own (omp shows the folder
// then) leaves the space unnamed, so it follows its folder.

import { View, div } from "gpui-kit";
import { spaces, panes, machines, run, shared, setShared } from "herdr";
import { sessionName } from "./lib/names.js";

// omp titles itself with its folder's last segment until a session has a name of its own: compare with
// that literal segment (a home folder is `bruno` there, not names.js's `~`).
const leaf = (path) => (path ?? "").replace(/\/+$/, "").split("/").pop();

// A rename lands only when the space's machine answers, so one asked for is
// not asked again for a while: every render would repeat it, and a rename on a
// machine that never answers would turn into a render loop.
const PATIENCE_MS = 15000;

export default class SessionNames extends View {
  init() {
    this.asked = new Map(); // space id -> { name, at }
  }

  // Asks Herdr to rename a space, at most once per name per PATIENCE_MS.
  rename(id, name) {
    const last = this.asked.get(id);
    if (last && last.name === name && Date.now() - last.at < PATIENCE_MS) return;
    this.asked.set(id, { name, at: Date.now() });
    run("space.rename", { id, name });
  }

  render() {
    const saved = shared("session-names.auto") ?? {};
    const auto = { ...saved };
    const ready = new Set(machines().filter((m) => m.layout === "ready").map((m) => m.name ?? ""));
    const live = new Set();
    for (const space of spaces()) {
      live.add(space.id);
      // Structural commands fail while a machine's layout is unavailable.
      if (!ready.has(space.machine ?? "")) continue;
      const tabs = new Set(space.tabs.map((t) => t.id));
      // The space's agent: its first pane whose program reports a status.
      const agent = panes().find((p) => tabs.has(p.tab) && p.status !== null && p.terminal);
      const name = agent ? sessionName(agent.title, agent.app ?? agent.program?.key) : "";
      // No session name yet: omp titles itself with the folder.
      const wanted = name && name !== leaf(agent.cwd) && name !== leaf(space.folder) ? name : "";
      const ours = !space.named || auto[space.id] === space.name;
      if (!ours) {
        // Renamed by hand (or Herdr changed our name): never touched again.
        delete auto[space.id];
        continue;
      }
      if (wanted && wanted !== space.name) {
        this.rename(space.id, wanted);
        auto[space.id] = wanted;
      } else if (!wanted && space.named && auto[space.id] === space.name) {
        // The session lost its name (a new session in the same terminal).
        this.rename(space.id, "");
        delete auto[space.id];
      }
    }
    // Forget spaces that are gone, except on a machine that's just unreachable
    // (remote ids carry its "machine/" prefix and come back with it).
    for (const id of Object.keys(auto)) {
      const machine = id.includes("/") ? id.split("/")[0] : "";
      if (!live.has(id) && ready.has(machine)) delete auto[id];
    }
    // setShared re-renders every mod: only when the map really changed.
    if (JSON.stringify(auto) !== JSON.stringify(saved)) setShared("session-names.auto", auto);
    return div();
  }
}
