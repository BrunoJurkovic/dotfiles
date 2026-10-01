# ── Path ───────────────────────────────────────────────────
typeset -U PATH  # deduplicate PATH entries
export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:$PATH"
# Prepended, not appended: Homebrew ships dart 3.5.2, which predates
# `dart format --language-version` (Dart 3.6+). //tools/goodcode pins that flag,
# so an appended fvm path let the stale brew dart win and broke the dart lint
# lane. fvm's SDK must resolve first. (PRO-3850)
export PATH="$HOME/fvm/default/bin:$PATH"
export PATH="$PATH:$HOME/.pub-cache/bin"

# ── zinit Plugin Manager ──────────────────────────────────
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
[ ! -d "$ZINIT_HOME" ] && mkdir -p "$(dirname $ZINIT_HOME)" && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
source "${ZINIT_HOME}/zinit.zsh"

# ── Completion (before OMZ libs that call compdef) ────────
# Perf: compinit's security audit (compaudit) costs ~600ms. Run it once a day;
# use the cached dump (-C, no audit) for every other shell that day.
autoload -Uz compinit
_zcompdump="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/zcompdump"
mkdir -p "${_zcompdump:h}"
if [[ $(date +%j) != $(date -r "$_zcompdump" +%j 2>/dev/null) ]]; then
  compinit -d "$_zcompdump"
else
  compinit -C -d "$_zcompdump"
fi
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}' 'r:|=*' 'l:|=* r:|=*'
zstyle ':completion:*' special-dirs true
zstyle ':completion:*' use-cache yes

# ── OMZ Libraries (cherry-picked, not the full framework) ─
zinit snippet OMZL::directories.zsh
zinit snippet OMZL::git.zsh
zinit snippet OMZL::history.zsh
zinit snippet OMZL::key-bindings.zsh
SAVEHIST=50000  # Override OMZ default (10000 < HISTSIZE causes silent history loss)

# ── Plugins (turbo-loaded after prompt renders) ───────────
zinit wait lucid for \
    OMZP::git \
    zdharma-continuum/fast-syntax-highlighting \
  atload"_zsh_autosuggest_start" \
    zsh-users/zsh-autosuggestions \
  blockf \
    zsh-users/zsh-completions

# ── Editor ─────────────────────────────────────────────────
export EDITOR="nvim"
export VISUAL="nvim"

# ── Aliases ────────────────────────────────────────────────
alias build_runner="fvm dart run build_runner"
alias ls="eza --icons --group-directories-first"
alias ll="eza --icons --group-directories-first -la"
alias lt="eza --icons --tree --level=2"
alias cat="bat --style=plain"

# ── Functions ──────────────────────────────────────────────
# Yazi file manager (y to open, cd on exit)
function y() {
  local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
  yazi "$@" --cwd-file="$tmp"
  if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
    builtin cd -- "$cwd"
  fi
  rm -f -- "$tmp"
}

# ── Theme ──────────────────────────────────────────────────
export BAT_THEME="Catppuccin Macchiato"
export FZF_DEFAULT_OPTS=" \
  --color=bg+:#363a4f,bg:#24273a,spinner:#f4dbd6,hl:#ed8796 \
  --color=fg:#cad3f5,header:#ed8796,info:#c6a0f6,pointer:#f4dbd6 \
  --color=marker:#f4dbd6,fg+:#cad3f5,prompt:#c6a0f6,hl+:#ed8796 \
  --color=selected-bg:#494d64"

# ── Tool Integrations (guarded) ───────────────────────────
# Starship prompt
command -v starship &>/dev/null && eval "$(starship init zsh)"

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh || { command -v fzf &>/dev/null && source <(fzf --zsh); }

# mise (tool version manager — manages node, bun, python, etc.)
command -v mise &>/dev/null && eval "$(mise activate zsh)"

# wtp (worktree plus)
command -v wtp &>/dev/null && eval "$(wtp shell-init zsh)"

# Angular CLI completion — cached.
# Perf: `ng completion script` boots Node and costs ~4.2s. Never run it inline.
# Cache is regenerated automatically whenever the ng binary changes.
if command -v ng &>/dev/null; then
  _ng_completion="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/ng-completion.zsh"
  if [[ ! -s $_ng_completion || $(command -v ng) -nt $_ng_completion ]]; then
    mkdir -p "${_ng_completion:h}" && ng completion script >| "$_ng_completion" 2>/dev/null
  fi
  source "$_ng_completion"
fi

# Dart CLI completion
[ -f "$HOME/.dart-cli-completion/zsh-config.zsh" ] && . "$HOME/.dart-cli-completion/zsh-config.zsh"

# ── Yabai (HEAD build uses com.asmvik label, plist uses com.koekeishiya) ──
alias yabai-restart='launchctl kickstart -k gui/$UID/com.koekeishiya.yabai && sleep 2 && unset TERMINFO && sudo yabai --load-sa'

# ── Custom Scripts ─────────────────────────────────────────
alias ctx='$HOME/Development/scripts/contextify.sh'
alias modgen='python3 $HOME/Development/scripts/nestjs-modgen.py'
# `work` is now a real script: scripts/.local/bin/work (stowed to ~/.local/bin)

export CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
export RIPGREP_CONFIG_PATH="$HOME/.ripgreprc"
# omp resolves credentials through the tailnet auth broker; if that host is
# down, start from the encrypted cached snapshot for a day (default is 1 h).
export OMP_AUTH_BROKER_SNAPSHOT_TTL_MS=86400000

# zoxide (replaces cd) — must be last to avoid chpwd_functions being overwritten
export _ZO_DOCTOR=0
command -v zoxide &>/dev/null && eval "$(zoxide init zsh --cmd cd)"

# ── Fastfetch on new terminal ─────────────────────────────
# Perf: fastfetch costs ~1.1s and fires on every window AND every split.
# Show it at most once per $ZSH_FASTFETCH_INTERVAL minutes, so the first terminal of a
# session greets you and rapid splits stay instant.
# Knobs: set interval to 0 to always show; comment out the block to disable entirely.
if command -v fastfetch &>/dev/null; then
  _ff_stamp="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/fastfetch-shown"
  _ff_interval=${ZSH_FASTFETCH_INTERVAL:-30}
  _ff_last=$(date -r "$_ff_stamp" +%s 2>/dev/null || printf 0)
  if (( ($(date +%s) - _ff_last) / 60 >= _ff_interval )); then
    mkdir -p "${_ff_stamp:h}" && : >| "$_ff_stamp"
    fastfetch
  fi
  unset _ff_stamp _ff_interval _ff_last
fi

# pi-fff: override mode (replaces built-in grep/find/multi_grep with FFF)
export PI_FFF_MODE=override

# ── Local-only secrets (gitignored, not in the public dotfiles repo) ──
[ -f "${ZDOTDIR:-$HOME/.dotfiles/zsh}/.env.local" ] && source "${ZDOTDIR:-$HOME/.dotfiles/zsh}/.env.local"
