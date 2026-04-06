#!/usr/bin/env bash
#
# macOS defaults — idempotent, safe to re-run.
# Curated for a tiling window manager setup.

set -euo pipefail

echo "Applying macOS defaults..."

# ── Dock ───────────────────────────────────────────────────
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0
defaults write com.apple.dock launchanim -bool false
defaults write com.apple.dock no-bouncing -bool true
defaults write com.apple.dock mineffect -string scale
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock mru-spaces -bool false
defaults write com.apple.dock expose-animation-duration -float 0.1
defaults write com.apple.dock springboard-show-duration -float 0
defaults write com.apple.dock springboard-hide-duration -float 0
defaults write com.apple.dock springboard-page-duration -float 0

# ── WindowManager (Sequoia) ───────────────────────────────
defaults write com.apple.WindowManager EnableTilingByEdgeDrag -bool false
defaults write com.apple.WindowManager EnableTopTilingByEdgeDrag -bool false
defaults write com.apple.WindowManager EnableTilingOptionAccelerator -bool false
defaults write com.apple.WindowManager EnableStandardClickToShowDesktop -int 0

# ── Animations ─────────────────────────────────────────────
defaults write com.apple.universalaccess reduceMotion -bool true
defaults write NSGlobalDomain NSAutomaticWindowAnimationsEnabled -bool false
defaults write NSGlobalDomain NSWindowResizeTime -float 0.001
defaults write NSGlobalDomain QLPanelAnimationDuration -float 0
defaults write NSGlobalDomain NSToolbarFullScreenAnimationDuration -float 0

# ── Finder ─────────────────────────────────────────────────
defaults write com.apple.finder DisableAllAnimations -bool true
defaults write com.apple.finder AppleShowAllExtensions -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true

# ── Keyboard ──────────────────────────────────────────────
defaults write NSGlobalDomain KeyRepeat -int 2
defaults write NSGlobalDomain InitialKeyRepeat -int 15
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false

# ── Trackpad ──────────────────────────────────────────────
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true

# ── Screenshots ───────────────────────────────────────────
defaults write com.apple.screencapture location -string "$HOME/Pictures/Screenshots"
defaults write com.apple.screencapture type -string "png"
defaults write com.apple.screencapture disable-shadow -bool true

# ── Restart affected services ─────────────────────────────
echo "Restarting affected services..."
killall Dock 2>/dev/null || true
killall Finder 2>/dev/null || true
killall SystemUIServer 2>/dev/null || true

echo "macOS defaults applied."
