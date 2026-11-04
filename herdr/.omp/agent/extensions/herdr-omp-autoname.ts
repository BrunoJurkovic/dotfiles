// herdr-omp-autoname: name this pane's agent in herdr after the omp session
// name, and its tab and workspace too while the agent has them to itself.
//
// Lives beside herdr's managed herdr-omp-agent-state.ts, which owns lifecycle
// state and is overwritten on every `herdr integration install omp`. This file
// only reports names.
//
// Pane: display-only metadata (display_agent + title). herdr shows it in the
//   Agents sidebar, the goto picker and split borders, and drops it once omp
//   leaves the pane (the `agent: "omp"` guard). The pane's own label is untouched.
// Tab and workspace: renamed only while they hold just this pane and their
//   label is still unclaimed: herdr's default (a tab's position; a workspace's
//   git checkout or cwd name, `~` at home) or the last name an omp gave it.
//   A label you typed is never overwritten; rename it back to its default to
//   hand it back. The workspace name is what herdr's "needs attention" /
//   "finished" notifications and window title carry.
// Claims: the last name given to each tab and workspace is kept on disk per
//   herdr server, so the next omp in the pane (a new session, a resume after a
//   herdr restart) still recognises the label as its own. Held only in memory,
//   it read as typed by hand after any restart and the label froze.
// @ts-nocheck

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const socketPath = process.env.HERDR_SOCKET_PATH;
const paneId = process.env.HERDR_PANE_ID;
const source = "omp-autoname";
// OMPCODE=1 marks a nested omp started from an agent's shell: not the pane's agent.
const enabled = process.env.HERDR_ENV === "1" && !!socketPath && !!paneId && process.env.OMPCODE !== "1";
const POLL_MS = 3000;
const claimsDir = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
  "herdr-omp-autoname",
  createHash("sha256").update(socketPath ?? "").digest("hex").slice(0, 16),
);

// One newline-delimited JSON request per connection. Resolves to the parsed
// response, or undefined when the server is unreachable or slow.
function call(method: string, params: Record<string, unknown>): Promise<unknown> {
  const { promise, resolve } = Promise.withResolvers<unknown>();
  let buffer = "";
  const socket = net.createConnection(socketPath!);
  const timer = setTimeout(() => socket.destroy(), 1500);
  timer.unref?.();
  promise.finally(() => {
    clearTimeout(timer);
    socket.destroy();
  });
  socket.setEncoding("utf8");
  socket.on("connect", () => socket.write(`${JSON.stringify({ id: `${source}:${method}`, method, params })}\n`));
  socket.on("data", chunk => {
    buffer += chunk;
    const end = buffer.indexOf("\n");
    if (end < 0) return;
    try {
      resolve(JSON.parse(buffer.slice(0, end)));
    } catch {
      resolve(undefined);
    }
  });
  socket.on("error", () => resolve(undefined));
  socket.on("close", () => resolve(undefined));
  return promise;
}

// The object stored under `key`, if `value` is an object holding one.
function objectAt(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const child = (value as Record<string, unknown>)[key];
  return typeof child === "object" && child !== null ? (child as Record<string, unknown>) : undefined;
}

// herdr's automatic workspace labels for `cwd`: the directory's own name (`~`
// at home) until its git refresh lands, then the enclosing checkout's name.
function workspaceDefaults(cwd: string): string[] {
  const defaults = [cwd === os.homedir() ? "~" : path.basename(cwd) || cwd];
  for (let dir = cwd; path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, ".git"))) {
      defaults.push(path.basename(dir));
      break;
    }
  }
  return defaults;
}

// Name a tab or workspace `name` when this pane has it alone and its label is
// unclaimed (herdr's default or the last omp name), then remember the claim.
async function claim(kind: "tab" | "workspace", id: string, target: Record<string, unknown> | undefined, defaults: string[], name: string) {
  if (target?.pane_count !== 1) return;
  // Hex keeps ids like `wC:t1` safe on case-insensitive file systems.
  const file = path.join(claimsDir, Buffer.from(id).toString("hex"));
  const claimed = await fs.readFile(file, "utf8").catch(() => undefined);
  if (target.label !== name) {
    if (target.label !== claimed && !defaults.includes(target.label)) return;
    const renamed = await call(`${kind}.rename`, { [`${kind}_id`]: id, label: name });
    if (!objectAt(renamed, "result")) return;
  }
  if (claimed === name) return;
  const temp = `${file}.${process.pid}`;
  try {
    await fs.mkdir(claimsDir, { recursive: true });
    await fs.writeFile(temp, name);
    await fs.rename(temp, file);
  } catch {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

async function claimTabAndWorkspace(name: string) {
  const pane = objectAt(objectAt(await call("pane.get", { pane_id: paneId }), "result"), "pane");
  if (typeof pane?.workspace_id !== "string" || typeof pane.tab_id !== "string") return;
  const tabs = objectAt(await call("tab.list", { workspace_id: pane.workspace_id }), "result")?.tabs;
  if (Array.isArray(tabs)) {
    // herdr labels an unnamed tab with its position.
    const index = tabs.findIndex(tab => tab?.tab_id === pane.tab_id);
    await claim("tab", pane.tab_id, tabs[index], [String(index + 1)], name);
  }
  const workspace = objectAt(
    objectAt(await call("workspace.get", { workspace_id: pane.workspace_id }), "result"),
    "workspace",
  );
  const defaults = typeof pane.cwd === "string" ? workspaceDefaults(pane.cwd) : [];
  await claim("workspace", pane.workspace_id, workspace, defaults, name);
}

export default function (pi: ExtensionAPI) {
  if (!enabled) return;

  let reported: string | undefined; // name currently shown as this pane's agent
  let running = false;
  let polling = false;

  async function sync(recheck: boolean) {
    if (running) return;
    running = true;
    try {
      const name = (pi.getSessionName() ?? "").trim() || undefined;
      if (name !== reported) {
        const metadata = name ? { title: name, display_agent: name } : { clear_title: true, clear_display_agent: true };
        const sent = await call("pane.report_metadata", { pane_id: paneId, source, agent: "omp", ...metadata });
        if (!objectAt(sent, "result")) return; // retried on the next poll
        reported = name;
        recheck = true;
      }
      if (name && recheck) await claimTabAndWorkspace(name);
    } finally {
      running = false;
    }
  }

  // Only the pane's own interactive session; subagents share the process.
  function start(ctx) {
    if (ctx?.hasUI !== true || ctx?.agent?.kind === "sub") return;
    void sync(true);
    // The auto-title lands asynchronously during the first turn, and /rename
    // has no event: poll the in-memory name; herdr is only called on change.
    if (!polling) {
      polling = true;
      ctx.setInterval(() => sync(false), POLL_MS);
    }
  }

  pi.on("session_start", (_event, ctx) => start(ctx));
  pi.on("session_switch", (_event, ctx) => start(ctx));
  // A settle re-checks the tab and workspace, so one handed back (renamed to
  // its default) is picked up again.
  pi.on("agent_end", (_event, ctx) => {
    if (ctx?.hasUI === true && ctx?.agent?.kind !== "sub") void sync(true);
  });
  // omp clears ctx timers on shutdown; the next session_start polls again.
  pi.on("session_shutdown", () => {
    polling = false;
  });
}
