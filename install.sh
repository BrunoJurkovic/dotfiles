#!/usr/bin/env bash
#
#  Bruno's dotfiles installer
#  Usage: bash <(curl -fsSL https://raw.githubusercontent.com/BrunoJurkovic/dotfiles/main/install.sh)
#
#  Idempotent — safe to re-run at any time.

set -euo pipefail

DOTFILES="$HOME/.dotfiles"
REPO="https://github.com/BrunoJurkovic/dotfiles.git"

# ── Colors ─────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

step()  { echo -e "\n${PURPLE}${BOLD}::${NC} ${BOLD}$1${NC}"; }
ok()    { echo -e "   ${GREEN}ok${NC} $1"; }
skip()  { echo -e "   ${DIM}skip${NC} $1"; }
info()  { echo -e "   ${CYAN}..${NC} $1"; }
warn()  { echo -e "   ${RED}!!${NC} $1"; }

cat << 'BANNER'

    ┌────────────────────────────────────────┐
    │                                        │
    │        Bruno's Dotfiles                │
    │        ─────────────────               │
    │        yabai  skhd  sketchybar         │
    │        ghostty  neovim  starship       │
    │                                        │
    └────────────────────────────────────────┘

BANNER

# ── Xcode CLT ─────────────────────────────────────────────
step "Xcode Command Line Tools"
if xcode-select -p &>/dev/null; then
  ok "already installed"
else
  info "installing (this may take a while)..."
  xcode-select --install
  until xcode-select -p &>/dev/null; do sleep 5; done
  ok "installed"
fi

# ── Homebrew ───────────────────────────────────────────────
step "Homebrew"
if command -v brew &>/dev/null; then
  ok "already installed"
else
  info "installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
  ok "installed"
fi

# ── Clone Dotfiles ─────────────────────────────────────────
step "Dotfiles repository"
if [ -d "$DOTFILES/.git" ]; then
  ok "already cloned at $DOTFILES"
  info "pulling latest..."
  git -C "$DOTFILES" pull --rebase --quiet
else
  info "cloning to $DOTFILES..."
  git clone "$REPO" "$DOTFILES"
  ok "cloned"
fi

# ── Brew Bundle ────────────────────────────────────────────
step "Homebrew packages"
info "installing from Brewfile..."
brew bundle --file="$DOTFILES/Brewfile" --no-lock --quiet
ok "all packages installed"

# ── GNU Stow ──────────────────────────────────────────────
step "GNU Stow"
if ! command -v stow &>/dev/null; then
  brew install stow
fi
ok "available"

# ── Stow Packages ─────────────────────────────────────────
step "Symlinking configurations"

# Remove OMZ-generated .zshrc if it's not already a symlink (blocks stow)
if [ -f "$HOME/.zshrc" ] && [ ! -L "$HOME/.zshrc" ]; then
  mv "$HOME/.zshrc" "$HOME/.zshrc.omz-backup"
  info "backed up OMZ .zshrc to .zshrc.omz-backup"
fi

STOW_PACKAGES=(
  yabai
  skhd
  sketchybar
  starship
  git
  zsh
  nvim
  yazi
  bat
  btop
  fastfetch
  ghostty
  gh
)

for pkg in "${STOW_PACKAGES[@]}"; do
  if [ -d "$DOTFILES/$pkg" ]; then
    stow -d "$DOTFILES" -t "$HOME" --restow "$pkg" 2>/dev/null && ok "$pkg" || warn "$pkg had conflicts"
  else
    skip "$pkg (not found)"
  fi
done

# ── LaunchAgents ───────────────────────────────────────────
step "LaunchAgents"
mkdir -p "$HOME/Library/LaunchAgents"
for plist in "$DOTFILES/launchagents/"*.plist; do
  name=$(basename "$plist")
  sed "s|__HOME__|$HOME|g" "$plist" > "$HOME/Library/LaunchAgents/$name"
  ok "$name"
done

# ── Oh My Zsh ─────────────────────────────────────────────
step "Oh My Zsh"
if [ -d "$HOME/.oh-my-zsh" ]; then
  ok "already installed"
else
  info "installing..."
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
  ok "installed"
fi

# Plugins
ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

if [ ! -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ]; then
  git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
  ok "zsh-autosuggestions"
else
  skip "zsh-autosuggestions (exists)"
fi

if [ ! -d "$ZSH_CUSTOM/plugins/fast-syntax-highlighting" ]; then
  git clone https://github.com/zdharma-continuum/fast-syntax-highlighting "$ZSH_CUSTOM/plugins/fast-syntax-highlighting"
  ok "fast-syntax-highlighting"
else
  skip "fast-syntax-highlighting (exists)"
fi

# ── Screenshots Directory ─────────────────────────────────
mkdir -p "$HOME/Pictures/Screenshots"

# ── macOS Defaults ─────────────────────────────────────────
step "macOS defaults"
read -rp "   Apply macOS defaults? (y/N) " apply_defaults
if [[ "$apply_defaults" =~ ^[Yy]$ ]]; then
  bash "$DOTFILES/macos/defaults.sh"
  ok "applied"
else
  skip "user declined"
fi

# ── instantspaces ──────────────────────────────────────────
step "instantspaces (space animation removal)"
INSTANT="$HOME/Development/instantspaces"
if [ -d "$INSTANT" ]; then
  ok "already cloned"
else
  info "clone and build manually:"
  echo -e "   ${DIM}cd ~/Development && git clone https://github.com/flawnn/instantspaces.git${NC}"
  echo -e "   ${DIM}cd instantspaces && make install${NC}"
  echo -e "   ${DIM}killall Dock && sudo ./scripts/inject.sh min0125${NC}"
fi

# ── Done ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  All done!${NC}"
echo ""
echo -e "  ${DIM}Restart your terminal or run: source ~/.zshrc${NC}"
echo -e "  ${DIM}Start services: brew services start yabai skhd sketchybar${NC}"
echo ""
