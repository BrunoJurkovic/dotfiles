DOTFILES := $(shell pwd)
STOW_PACKAGES := yabai skhd sketchybar starship git zsh nvim yazi wezterm bat btop fastfetch kanata aerospace karabiner gh

.PHONY: all install stow unstow update macos brew clean help

all: install ## Run full installation

install: ## Full setup (brew + stow + agents)
	@bash install.sh

stow: ## Symlink all packages
	@for pkg in $(STOW_PACKAGES); do \
		echo "  stow $$pkg"; \
		stow -d $(DOTFILES) -t $(HOME) --restow $$pkg 2>/dev/null || echo "  !! $$pkg conflict"; \
	done
	@echo "done"

unstow: ## Remove all symlinks
	@for pkg in $(STOW_PACKAGES); do \
		echo "  unstow $$pkg"; \
		stow -d $(DOTFILES) -t $(HOME) -D $$pkg 2>/dev/null || true; \
	done
	@echo "done"

stow-%: ## Stow a single package (e.g. make stow-yabai)
	stow -d $(DOTFILES) -t $(HOME) --restow $*

unstow-%: ## Unstow a single package
	stow -d $(DOTFILES) -t $(HOME) -D $*

update: ## Pull latest and re-stow
	git pull --rebase
	@$(MAKE) stow

brew: ## Install Homebrew packages
	brew bundle --file=$(DOTFILES)/Brewfile --no-lock

macos: ## Apply macOS defaults
	@bash macos/defaults.sh

agents: ## Copy LaunchAgents
	@mkdir -p $(HOME)/Library/LaunchAgents
	@for plist in launchagents/*.plist; do \
		cp "$$plist" "$(HOME)/Library/LaunchAgents/$$(basename $$plist)"; \
		echo "  copied $$(basename $$plist)"; \
	done

clean: ## Remove broken symlinks in ~
	@find $(HOME) -maxdepth 3 -type l ! -exec test -e {} \; -print -delete 2>/dev/null || true

help: ## Show this help
	@grep -E '^[a-zA-Z_%/-]+:.*## ' Makefile | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
