// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/usage (copied in by herdr-reload; edit there).
// The Usage panel's picture, drawn outside Herdr: `jsc -m render.mjs -- <input JSON>` prints panelSvg's
// answer ({ svg, w, h, hits }) as JSON (data.js drawPanel). Inside Herdr this string building took seconds
// (its JS runs it thousands of times slower than a JIT), and Herdr cuts a task that long off without a trace,
// which left the panel on its skeleton for good. JavaScriptCore's shell ships with macOS and draws it in ms.
// `print` and `arguments` are the jsc shell's own.
import { panelSvg } from "./art.js";

print(JSON.stringify(panelSvg(JSON.parse(globalThis.arguments[0]))));
