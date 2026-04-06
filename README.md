<div align="center">

```
                @@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@
          @@@@@@@@@@@@@@@@@@@@@@@@@@@@
         @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
        @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
       @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
      @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     @@@@@@@@@      @         @@@@        @
     @@@@@@@@@        @@
     @@@@@@@@@      @@@@@@      @@@@@@
     @@@@@@@@@      @@@@@@      @@@@@@
      @@@@@@@@      @@@@@@      @@@@@@
       @@@@@@@      @@@@@@      @@@@@@
        @@@@@@      @@@@@@      @@@@@@
         @@@@@      @@@@@@      @@@@@@
          @@@@      @@@@@@      @@@@@@
             @@@@@@@@@@@@@@@@@@@@@@
                @@@@@@@@@@@@@@@@
```

# dotfiles

**macOS tiling window manager setup on Apple Silicon**

`yabai` | `skhd` | `sketchybar` | `neovim` | `ghostty` | `starship`

[![macOS](https://img.shields.io/badge/macOS-Sequoia_15-000?style=flat&logo=apple&logoColor=white)](#)
[![WM](https://img.shields.io/badge/WM-yabai-8aadf4?style=flat)](#yabai)
[![Shell](https://img.shields.io/badge/Shell-zsh-a6da95?style=flat)](#zsh)
[![Theme](https://img.shields.io/badge/Theme-Catppuccin_Macchiato-c6a0f6?style=flat)](#)

</div>

---

## Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/BrunoJurkovic/dotfiles/main/install.sh)
```

Or manually:

```bash
git clone https://github.com/BrunoJurkovic/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
make install
```

## What's Inside

### Window Management

| Tool | Config | What it does |
|------|--------|-------------|
| [yabai](https://github.com/koekeishiya/yabai) | [`yabai/`](yabai/) | BSP tiling window manager (SIP disabled) |
| [skhd](https://github.com/koekeishiya/skhd) | [`skhd/`](skhd/) | Vim-style hotkey daemon (`alt+hjkl`) |
| [SketchyBar](https://github.com/FelixKratz/SketchyBar) | [`sketchybar/`](sketchybar/) | Custom status bar with per-space accent colors |
| [JankyBorders](https://github.com/FelixKratz/JankyBorders) | [`launchagents/`](launchagents/) | Glow borders on active window |
| [instantspaces](https://github.com/flawnn/instantspaces) | [`launchagents/`](launchagents/) | Removes space switching animation |

### Shell & Terminal

| Tool | Config | What it does |
|------|--------|-------------|
| [zsh](https://www.zsh.org/) + [Oh My Zsh](https://ohmyz.sh/) | [`zsh/`](zsh/) | Shell with autosuggestions + syntax highlighting |
| [Starship](https://starship.rs/) | [`starship/`](starship/) | Minimal prompt with git integration |
| [Ghostty](https://ghostty.org/) | - | GPU-accelerated terminal |
| [WezTerm](https://wezterm.org/) | [`wezterm/`](wezterm/) | Secondary terminal (Lua config) |

### CLI Replacements

| Tool | Replaces | Install |
|------|----------|---------|
| `bat` | `cat` | `brew install bat` |
| `eza` | `ls` | `brew install eza` |
| `ripgrep` | `grep` | `brew install ripgrep` |
| `zoxide` | `cd` | `brew install zoxide` |
| `fzf` | `ctrl-r` | `brew install fzf` |
| `delta` | `diff` | `brew install git-delta` |
| `yazi` | `ranger` | `brew install yazi` |
| `btop` | `htop` | `brew install btop` |
| `lazygit` | `git` TUI | `brew install lazygit` |

### Editor & Dev

| Tool | Config | What it does |
|------|--------|-------------|
| [Neovim](https://neovim.io/) | [`nvim/`](nvim/) | Kickstart-based config with LSP |
| [Yazi](https://yazi-rs.github.io/) | [`yazi/`](yazi/) | Terminal file manager |

## Theme

**Catppuccin Macchiato** everywhere &mdash; terminal, editor, bar, borders, bat, btop, fzf, yazi.

```
Rosewater  #f4dbd6    Flamingo  #f0c6c6    Pink      #f5bde6
Mauve      #c6a0f6    Red       #ed8796    Maroon    #ee99a8
Peach      #f5a97f    Yellow    #eed49f    Green     #a6da95
Teal       #8bd5ca    Sky       #91d7e3    Sapphire  #7dc4e4
Blue       #8aadf4    Lavender  #b7bdf8    Text      #cad3f5
```

Per-space accent colors in SketchyBar:

| Space | Name | Color |
|-------|------|-------|
| 1 | Terminal | `#8aadf4` Blue |
| 2 | Browser | `#a6da95` Green |
| 3 | Social | `#c6a0f6` Mauve |
| 4 | Design | `#f5bde6` Pink |
| 5 | Misc | `#8bd5ca` Teal |

## Structure

```
~/.dotfiles/
├── aerospace/          # AeroSpace WM config (inactive)
├── bat/                # Catppuccin theme for bat
├── btop/               # System monitor + theme
├── fastfetch/          # System info with custom logo
├── gh/                 # GitHub CLI config
├── git/                # Git config + delta + global ignore
├── kanata/             # Keyboard remapping
├── karabiner/          # Karabiner-Elements config
├── nvim/               # Neovim (Kickstart-based)
├── sketchybar/         # Status bar items + plugins
├── skhd/               # Hotkey definitions
├── starship/           # Prompt configuration
├── wezterm/            # WezTerm terminal config
├── yabai/              # Tiling WM config + display setup
├── yazi/               # File manager + Catppuccin flavor
├── zsh/                # Shell config + aliases + plugins
├── launchagents/       # LaunchAgent plists (yabai, skhd, etc.)
├── macos/              # macOS defaults automation
├── Brewfile            # Homebrew package manifest
├── Makefile            # make stow, make brew, make macos
└── install.sh          # One-command bootstrap
```

## Key Bindings

<details>
<summary><strong>Window Management (skhd)</strong></summary>

| Key | Action |
|-----|--------|
| `alt + h/j/k/l` | Focus window (vim directions) |
| `alt + shift + h/j/k/l` | Swap window |
| `alt + n/p` | Cycle windows in space |
| `alt + 1-5` | Focus space |
| `alt + shift + 1-5` | Move window to space |
| `alt + shift + tab` | Move space to next display |
| `alt + tab` | Toggle recent space |
| `alt + -/=` | Resize window |
| `alt + /` | Toggle split direction |
| `alt + ,` | Stack layout |
| `alt + .` | BSP layout |

**Service mode** (`alt + shift + ;`):

| Key | Action |
|-----|--------|
| `r` | Balance layout |
| `f` | Toggle float (centered) |
| `c` | Center floating window |
| `backspace` | Close all windows but current |
| `alt + shift + h/j/k/l` | Warp window |

</details>

<details>
<summary><strong>App Launchers (skhd)</strong></summary>

| Key | Action |
|-----|--------|
| `alt + t` | Ghostty |
| `alt + c` | Chrome |
| `alt + d` | Discord |
| `alt + f` | Figma |
| `alt + s` | Simulator |
| `alt + o` | Obsidian |
| `alt + y` | Yazi (in Ghostty) |

</details>

## macOS Defaults

The `macos/defaults.sh` script configures:

- Disable Sequoia native tiling (conflicts with yabai)
- Zero animation delays (dock, Mission Control, Finder, windows)
- Disable "click wallpaper to reveal desktop"
- Disable space auto-rearranging
- Fast key repeat (2/15)
- Screenshots to `~/Pictures/Screenshots` as PNG

Run with `make macos` or manually during install.

## Requirements

- macOS Sequoia 15+ on Apple Silicon
- SIP partially disabled (for yabai scripting addition)
- [Homebrew](https://brew.sh/)
- [GNU Stow](https://www.gnu.org/software/stow/) (`brew install stow`)

## Acknowledgments

Inspired by [FelixKratz/dotfiles](https://github.com/FelixKratz/dotfiles), [m4xshen/dotfiles](https://github.com/m4xshen/dotfiles), and [Lissy93/dotfiles](https://github.com/Lissy93/dotfiles).
