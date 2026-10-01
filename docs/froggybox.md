# froggybox

One command to get a working remote agent environment on an EC2 build box.

```
froggybox up          start · bootstrap · sync · open herdr (Mac + box)
froggybox dashboard   live machine · agents · missions
froggybox down        stop the box (EBS persists)
froggybox status      state, public-ssh state, spend
froggybox ssh         plain shell
froggybox sync        re-push local env without attaching
froggybox fetch       bring branches home over git (non-destructive)
froggybox breakglass  open public SSH for this IP when the tailnet is broken
froggybox help        banner + usage
```

Installed by `make stow` (package `froggybox/` → `~/bin/froggybox`; package
`herdr/` → `~/.config/herdr/config.toml`). Needs `omp`, `herdr` and
`terminal-notifier` locally (`brew install herdr terminal-notifier`).

---

## Machine identity

The script is public; nothing that identifies the box lives in it. It sources
`~/.config/froggybox/env` (mode `600`, never committed) and refuses to run
without these:

```
FROGGYBOX_INSTANCE_ID   EC2 instance id
FROGGYBOX_KEY           path to the instance's SSH private key
FROGGYBOX_TS_HOST       the box's tailnet FQDN (<name>.<tailnet>.ts.net)
FROGGYBOX_REPOS         space-separated repo dirs under ~/Development to sync
FROGGYBOX_AUTH_BROKER_URL  tailnet URL of the shared omp auth broker
```

Optional:

```
FROGGYBOX_CLONES        repos with their own remote, cloned instead of rsynced:
                        space-separated `name=url` or `name=url#branch`
FROGGYBOX_ENV           alternative path for the file above
FROGGYBOX_REGION        default eu-central-1
FROGGYBOX_TS_AUTHKEY    default ~/.config/tailscale/authkey
FROGGYBOX_NO_BANNER=1   skip the animation
NO_COLOR=1              plain text output
```

**Private extras: `~/.config/froggybox/sync.d/`.** Tools and secrets that must
not appear in this repo (CLIs that name a client, API keys) are executables in
that directory. `up` and `sync` run each one locally after the sync; they reach
the box through the `froggybox` ssh alias, and their last output line becomes
the status line. Pipe secrets over ssh stdin into `0600` files on the box so
they never touch argv or a log.

---

## Why this exists

The MacBook Air M2 (8 cores, 16 GB) is the bottleneck, not the code. Measured
on a real Rust workspace:

| metric | M2 (untuned) | EC2 m7a.4xlarge (untuned) | ratio |
|---|---|---|---|
| cold `cargo check` | 91.6s | 9.1s | **10.1x** |
| cold `cargo build` | 169.8s | 16.1s | **10.5x** |
| incremental build | 22.8s | 1.1s | 7.5x |
| incremental check | 86.9s | 6.5s | **13.5x** |

Four concurrent workspaces peaked at **57 rustc processes / 14.6 GB RSS** —
against 16 GB total on the Mac, with 4–6 GB already taken by OS, editor,
browser and the agent.

Six concurrent real mission DoDs on the box: **549.6s untuned → 272.5s tuned
(2.02x)**. The box now runs m8a.4xlarge (same 16 cores / 64 GB, newer EPYC).

---

## Architecture

```
  MacBook (review)                    EC2 box (execute)
  ────────────────                    ─────────────────
  editor, git review      ──sync──▶   16 cores, 64 GB
  froggybox CLI                       herdr server, omp agents in panes
       ▲                              repos from FROGGYBOX_REPOS
       └──────── git fetch ───────────┘
```

**Two rules the design is built on:**

1. **Config flows one way, local → remote.** The box is authoritative for
   mission work. Agent memory is never rsynced back — two agent instances
   writing the same store is last-writer-wins corruption.

2. **Work comes home over git, never rsync.** The synced repos have no
   `origin`, so git history is the only safe channel. `froggybox fetch` writes
   only `refs/remotes/froggybox/*` — it cannot touch your working tree.

**On-demand, not spot.** Subagents run ~30 min and are not resumable, so a
2-minute spot interruption warning cannot be acted on, and spot termination
deletes the root volume with in-flight work on it.

---

## Connectivity: tailnet only

The box joins the tailnet as `froggybox` (`FROGGYBOX_TS_HOST`). Tailscale must
be running on the Mac; it is the only way in.

- The **public IP changes on every stop/start**. The tailnet address does not,
  so the `Host froggybox` block in `~/.ssh/config` is written once.
- **Public port 22 is closed.** Every `up` that reaches the box over the
  tailnet revokes any port-22 ingress rule, so closed is the state that
  converges. `froggybox status` shows which state the security group is in.
- **Break-glass.** If Tailscale on the box is broken, `froggybox breakglass`
  opens port 22 to this machine's current public IP; `up` then falls back to
  the public IP, re-joins the tailnet, and the next tailnet `up` seals it again.

The auth key lives at `~/.config/tailscale/authkey` (mode `600`) and is never
passed on a local command line.

---

## What gets installed

| layer | tools |
|---|---|
| Rust | rustup (default `stable`), rustfmt, clippy, cargo-nextest, mold, sccache |
| Agent | **omp**, the exact local version; fuse-overlayfs for omp's task isolation |
| Node | Node 22, npm, pnpm, bun |
| Search | **ripgrep, fd** — what agents and skills call in plain shell commands |
| Workflow | gh, git identity, herdr, jq, build-essential, clang |
| Containers | Docker, compose, buildx; the user is in `docker` so panes reach the daemon |

- **Rust toolchains come from each repo's `rust-toolchain.toml`.** After the
  repos sync, `rustup toolchain install` runs in every repo that has one, plus
  rustfmt and clippy. Bump the file, the box follows on the next `up`/`sync`.
- **sccache, gh and nextest track their latest release.** Each `up` compares
  the installed version with the latest GitHub release and reinstalls only
  when they differ; an unreachable GitHub API skips the check.

Global `~/.cargo/config.toml` carries the tuning that measured 2x:

```toml
[build]
rustc-wrapper = "/usr/local/bin/sccache"
incremental = false
rustflags = ["-C", "debuginfo=line-tables-only", "-C", "link-arg=-fuse-ld=mold"]
```

`debuginfo=line-tables-only` alone cut the target dir 6691 MB → 2613 MB (61%).

---

## The agent: omp

- **Same version as the Mac.** `up` reads the local `omp --version`, downloads
  that release's `omp-linux-x64` and installs it only if it matches the
  release's `SHA256SUMS.txt`. Upgrade omp locally (and on the broker host)
  first; the next `up` follows. Pi is uninstalled; `~/.pi` stays as data.
- **Config flows one way.** `~/.omp/agent/config.yml` and `managed-skills/`
  are rsynced up. After every sync the box re-applies what differs on Linux:
  `isolation.backend auto` (APFS clones do not exist there) and
  `auth.broker.url`.
- **Credentials are never copied.** `agent.db` stays local. Both machines
  resolve model credentials through one `omp auth-broker` on an always-on
  tailnet host (`FROGGYBOX_AUTH_BROKER_URL`), so no two hosts ever hold the
  same refresh token. Its bearer token, `~/.omp/auth-broker.token`, is piped
  to the box on every sync and never appears in argv or logs.
- **Broker outage.** omp keeps an encrypted snapshot of the broker's
  credentials (`~/.omp/cache/auth-broker-snapshot.enc`). Both machines set
  `OMP_AUTH_BROKER_SNAPSHOT_TTL_MS=86400000` (the Mac in `.zshrc`, the box in
  the herdr unit, which every pane inherits), so omp still starts for a day
  with the broker host down. Changing the unit restarts herdr on the next
  `up`; omp sessions resume.
- **Per machine, deliberately:** sessions, blobs, history, caches and
  `memories/` — a one-way copy of memories would overwrite what the box learns.

---

## Sessions: herdr

One herdr window on the Mac shows both machines: **Local** and **froggybox**
in the sidebar, `prefix+w` (`ctrl+b w`) to switch, `ctrl+b q` to detach.
omp always runs on the machine that owns the code; herdr only holds the
terminals and draws them.

- **Box:** `herdr server` runs as a systemd user service with lingering on,
  so it is up from boot with nobody logged in. The omp integration
  (`herdr integration install omp`) reports each agent's state and session
  file to herdr.
- **Workspaces:** every repo on the box (`FROGGYBOX_REPOS` plus each
  `FROGGYBOX_CLONES` name) gets one workspace with an omp agent named after
  it, once. `~/.config/froggybox/layout-seeded` on the box remembers which got
  theirs, so a workspace you close stays closed. Agent names must match
  `[a-z][a-z0-9_-]{0,31}`.
- **After a stop:** the server restores the layout from its snapshot and
  restarts every omp pane as `omp --resume=<session>`, so conversations
  survive `down`, the curfew and reboots. Running builds and dev servers do
  not; those come back as fresh shells in the same directory.
- **Mac:** `up` saves the box as a herdr machine (`herdr machine add
  froggybox`) once, then opens `herdr`. Notifications go to Notification
  Center via terminal-notifier when an agent on either machine finishes or
  needs input. Inside a herdr pane `up` skips the nested client.
- **Version:** the box installs the local herdr release, verified against
  GitHub's sha256 digest for the asset. Update with `brew upgrade herdr`;
  restart a server only when you want its new server-side features
  (`herdr server stop` ends its panes).
- **Pushing from panes:** panes reach the Mac's forwarded ssh agent through
  herdr's stable address → `~/.ssh/agent.sock` (the unit's `SSH_AUTH_SOCK`)
  → the newest live forwarded socket, which `~/.ssh/rc` repoints at on every
  forwarding login once the old one has died. Ubuntu's `gpg-agent-ssh.socket`
  is masked: it holds no keys, and herdr would otherwise bind panes to it for
  good and every push would be denied. Pushes work while a connection that
  forwards the agent is open (herdr's own link to the box counts).
- **Timezone:** the box mirrors the Mac's zone as `TZ`, the way CI sets it,
  in `/etc/environment` (SSH sessions) and the herdr unit (panes); tests that
  depend on local time pass the same on both. The system clock stays UTC, so
  cron, including the curfew, keeps its schedule.

---

## Cost

| state | rate |
|---|---|
| running | $1.1664/h (m8a.4xlarge, eu-central-1) |
| stopped | ~$14.28/mo (150 GB gp3 EBS only) |

The box's first-boot user-data installs a hard curfew,
`0 3 * * * root /sbin/shutdown -h now` (03:00 UTC). Shutdown behaviour is
`stop`, so it halts rather than terminates; herdr resumes the omp sessions on
the next `up`, but anything mid-run at 03:00 is cut off.

---

## Troubleshooting

**`up` dies with "tailnet unreachable and public ssh is closed"**
Tailscale is not running on this Mac, or the box never joined the tailnet.
Start Tailscale here first; only if the box itself is broken, run
`froggybox breakglass` and `up` again.

**`fetch` reports `Permission denied (publickey)`**
The git remote must go through the `froggybox` ssh alias
(`ssh://froggybox/home/ubuntu/Development/<repo>`): OpenSSH matches `Host`
patterns against the name you typed, so a bare tailnet FQDN gets no
`IdentityFile`. `sync` and `fetch` both write the alias form, and `fetch` now
prints the failure instead of a stale branch count.

**`E: Unable to locate package rg`**
Command name ≠ package name: `rg` → `ripgrep`, `fd` → `fd-find`. **apt aborts
the entire transaction on one bad name**, so a single typo silently skips every
other package too.

**`fd: command not found` on the box**
Ubuntu ships it as `fdfind`. Bootstrap symlinks it to `/usr/local/bin/fd`.

**`missing or unsuitable terminal: xterm-ghostty`**
Ghostty/kitty/wezterm advertise a `TERM` the box has never seen, which breaks
plain-shell tools under `froggybox ssh`. `up` exports the local terminfo with
`infocmp -x | ssh … tic -x -`. herdr panes always use `xterm-256color`.

**`rg` finds nothing over SSH**
With no path argument and stdin not a TTY, ripgrep searches **stdin** rather
than the cwd. Always pass an explicit path in non-interactive SSH.

**Instance shows `Client.InstanceInitiatedShutdown` around 03:00 UTC**
That is the curfew above, not a crash.

---

## Bringing work home

```bash
froggybox fetch                                   # safe: only updates refs
git log froggybox/feat/the-thing                  # review
git diff main..froggybox/feat/the-thing
git checkout -b feat/the-thing froggybox/feat/the-thing
```

`git fetch` never touches your working tree, branches, or uncommitted changes.
The reverse direction is `froggybox sync` (rsync up). You cannot `git push` to
the box: git rejects pushes to a non-bare repo's checked-out branch.

**Cloned repos** (`FROGGYBOX_CLONES`) skip all of this: the box clones them
from their own remote with your forwarded ssh agent, later syncs only
`git fetch`, and work goes back by pushing to that remote. Pushes from the
box therefore need the git key loaded in the Mac's agent (`ssh-add`) while a
connection to the box is open. Project setup that is not public (toolchains,
`.env` files) belongs in a `sync.d` hook.
