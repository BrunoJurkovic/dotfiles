# ── Path ───────────────────────────────────────────────────
typeset -U PATH  # deduplicate PATH entries
export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:$PATH"
export PATH="$PATH:$HOME/fvm/default/bin"
export PATH="$PATH:$HOME/.pub-cache/bin"

# ── Oh My Zsh ─────────────────────────────────────────────
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""
plugins=(git zsh-autosuggestions fast-syntax-highlighting)
source "$ZSH/oh-my-zsh.sh"

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

# Angular CLI (only if installed)
command -v ng &>/dev/null && source <(ng completion script)

# Dart CLI completion
[ -f "$HOME/.dart-cli-completion/zsh-config.zsh" ] && . "$HOME/.dart-cli-completion/zsh-config.zsh"

# ── Yabai (HEAD build uses com.asmvik label, plist uses com.koekeishiya) ──
alias yabai-restart='launchctl kickstart -k gui/$UID/com.koekeishiya.yabai && sleep 2 && unset TERMINFO && sudo yabai --load-sa'

# ── Custom Scripts ─────────────────────────────────────────
alias ctx='$HOME/Development/scripts/contextify.sh'
alias modgen='python3 $HOME/Development/scripts/nestjs-modgen.py'
alias work='$HOME/Development/scripts/tmux-work.sh'

export CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
export RIPGREP_CONFIG_PATH="$HOME/.ripgreprc"

# zoxide (replaces cd) — must be last to avoid chpwd_functions being overwritten
export _ZO_DOCTOR=0
command -v zoxide &>/dev/null && eval "$(zoxide init zsh --cmd cd)"

# ── Fastfetch on new terminal ─────────────────────────────
command -v fastfetch &>/dev/null && fastfetch
