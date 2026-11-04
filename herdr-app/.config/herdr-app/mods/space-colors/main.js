// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/space-colors (copied in by herdr-reload; edit there).
// Headless: pins every space's colour into shared("space.colors"), keyed by space id (the key the
// sessions list, pane headers and board read). Colours belong to the REPO, not the space: spaces
// are named after their omp session (session-names), and every session in one repo shares its
// colour, on the Mac and froggybox alike. A repo's colour is its pin from space-colors.json
// (herdrrc's `space_color` lines, rendered by herdr-reload), else lib/tokens.js accentFor: a stable one
// from a hash of the repo name over the Catppuccin Macchiato accents. Draws nothing; it only sits in the
// layout (root.floating) to run.

import { View, div } from "gpui-kit";
import { appHome, readTextFile, watchFolder, spaces, panes, shared, setShared } from "herdr";
import { colorKey } from "./lib/names.js";
import { accentFor } from "./lib/tokens.js";

const FILE = "space-colors.json";
const HEX = /^#[0-9a-f]{6}$/i;

// A space's repo: the folder it starts terminals in, else where its first terminal is (names.js colorKey:
// ~/.dotfiles is the `dotfiles` repo); the space's name for the root.
function repoOf(space) {
  const tabs = new Set(space.tabs.map((t) => t.id));
  const at = space.folder || panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || "";
  return colorKey(at) || space.name.replace(/^\./, "").toLowerCase();
}

function parse(text) {
  const pins = {};
  try {
    for (const [name, colour] of Object.entries(JSON.parse(text ?? "{}"))) {
      if (typeof colour === "string" && HEX.test(colour)) pins[name.toLowerCase()] = colour.toLowerCase();
    }
  } catch {
    // A half-written file: keep what we have until the next change.
    return null;
  }
  return pins;
}

export default class SpaceColors extends View {
  init(_props, cx) {
    this.pins = {};
    this.raw = undefined;
    cx.spawn(async (cx) => {
      await this.load(cx);
      for (;;) {
        const changed = await watchFolder(appHome());
        // A reloaded build's old loop ends at its next cx use: touch it on every wake.
        await cx.sleep(0);
        // Herdr writes view.json, shared.json... here all the time: only our file matters.
        if (!changed.some((path) => path.endsWith(`/${FILE}`))) continue;
        await this.load(cx);
      }
    });
    // A read that failed (the app just starting, the file mid-write) is retried,
    // and the pins are re-read now and then in case a change went unseen.
    cx.timer.every(60000, (cx) => { this.load(cx); });
  }

  async load(cx) {
    const text = await readTextFile(`${appHome()}/${FILE}`).catch(() => null);
    // Not readable: keep what we have and try again on the next wake or tick.
    if (text == null || text === this.raw) return;
    const pins = parse(text);
    if (!pins) return;
    this.raw = text;
    this.pins = pins;
    cx.notify();
  }

  render() {
    const sp = spaces();
    if (sp.length) {
      const want = {};
      for (const s of sp) {
        const repo = repoOf(s);
        want[s.id] = this.pins[repo] ?? accentFor(repo);
      }
      const have = shared("space.colors") ?? {};
      const same = Object.keys(have).length === sp.length && sp.every((s) => have[s.id] === want[s.id]);
      // Every setShared re-renders every mod: only when the map really changes.
      if (!same) setShared("space.colors", want);
    }
    return div();
  }
}
