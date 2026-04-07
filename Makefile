DOTFILES := $(shell pwd)
STOW_PACKAGES := yabai skhd sketchybar starship git zsh nvim yazi bat btop fastfetch ghostty gh lazygit ripgrep mise claude

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

agents: ## Copy LaunchAgents (substitutes __HOME__ with actual path)
	@mkdir -p $(HOME)/Library/LaunchAgents
	@for plist in launchagents/*.plist; do \
		sed 's|__HOME__|$(HOME)|g' "$$plist" > "$(HOME)/Library/LaunchAgents/$$(basename $$plist)"; \
		echo "  copied $$(basename $$plist)"; \
	done

clean: ## Remove broken symlinks in ~
	@find $(HOME) -maxdepth 3 -type l ! -exec test -e {} \; -print -delete 2>/dev/null || true

doctor: ## Check that all expected tools are installed
	@echo "Checking tools..."
	@fail=0; \
	for cmd in yabai skhd sketchybar borders bat eza rg fd zoxide fzf delta lazygit btop nvim starship mise ghostty gh stow jq; do \
		if command -v $$cmd >/dev/null 2>&1; then \
			printf "  \033[32m✓\033[0m %s\n" "$$cmd"; \
		else \
			printf "  \033[31m✗\033[0m %s (missing)\n" "$$cmd"; \
			fail=1; \
		fi; \
	done; \
	echo ""; \
	if [ "$$fail" = "1" ]; then echo "Run 'make brew' to install missing tools."; fi

test: ## Validate configs (zsh syntax, stow links)
	@echo "Checking zsh syntax..."
	@zsh -n $(DOTFILES)/zsh/.zshrc && echo "  zsh: ok" || echo "  zsh: FAIL"
	@echo "Checking stow links..."
	@broken=0; \
	for pkg in $(STOW_PACKAGES); do \
		stow -d $(DOTFILES) -t $(HOME) --no-folding -n $$pkg 2>&1 | grep -q "conflict" && \
			{ echo "  $$pkg: conflict"; broken=1; } || echo "  $$pkg: ok"; \
	done; \
	[ "$$broken" = "0" ] && echo "All checks passed."

help: ## Show this help
	@grep -E '^[a-zA-Z_%/-]+:.*## ' Makefile | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
