local wezterm = require("wezterm")

return {
	-- Appearance
	color_scheme = "Tokyo Night Storm",
	colors = {
		-- Fine-tune cursor and tab bar to match Tokyo Night
		cursor_bg = "#c0caf5", -- Light purple cursor
		cursor_fg = "#1a1b26", -- Dark background for cursor
		tab_bar = {
			background = "#1a1b26",
			active_tab = {
				bg_color = "#7aa2f7",
				fg_color = "#1a1b26",
				intensity = "Bold",
			},
			inactive_tab = {
				bg_color = "#24283b",
				fg_color = "#a9b1d6",
			},
		},
	},
	bold_brightens_ansi_colors = true, -- Enhance bold text visibility
	window_background_opacity = 0.95, -- Subtle transparency for modern look
	hide_tab_bar_if_only_one_tab = true, -- Clean UI with single tab

	-- Font Configuration
	font = wezterm.font_with_fallback({
		{ family = "GeistMono Nerd Font", weight = "Regular" },
		{ family = "JetBrains Mono", weight = "Regular" }, -- Fallback for compatibility
	}),
	font_size = 16.0,
	line_height = 1.1,
	harfbuzz_features = { "calt=0", "clig=0", "liga=0" }, -- Optimize font rendering

	-- Padding
	window_padding = {
		left = 10,
		right = 10,
		top = 4,
		bottom = 4,
	},

	-- Cursor
	default_cursor_style = "BlinkingBar",
	cursor_blink_rate = 500,
	cursor_blink_ease_in = "Constant",
	cursor_blink_ease_out = "Constant",

	-- Scrollback
	scrollback_lines = 5000,
	enable_scroll_bar = true, -- Useful for large scrollback navigation

	-- Neovim Compatibility
	term = "xterm-256color",
	enable_wayland = false, -- Consistent with your Linux setup

	-- Rendering & Performance
	front_end = "WebGpu", -- Use WebGpu if supported, fallback to OpenGL
	animation_fps = 30, -- Balance smoothness and performance
	max_fps = 60, -- Cap FPS to reduce resource usage
	window_decorations = "RESIZE", -- Keep resizable window

	-- Window Behavior
	window_close_confirmation = "AlwaysPrompt", -- Prevent accidental closure
	automatically_reload_config = true, -- Seamless config tweaking

	-- Bell Feedback
	audible_bell = "Disabled", -- No annoying sounds
	visual_bell = {
		fade_in_duration_ms = 75,
		fade_out_duration_ms = 75,
		target = "CursorColor",
	},

	-- Keybindings
	keys = {
		-- Pane splitting
		{ key = "|", mods = "CTRL|SHIFT", action = wezterm.action.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
		{ key = "-", mods = "CTRL|SHIFT", action = wezterm.action.SplitVertical({ domain = "CurrentPaneDomain" }) },
		-- Pane navigation (avoid conflicts with Neovim <C-h/j/k/l>)
		{ key = "h", mods = "ALT", action = wezterm.action.ActivatePaneDirection("Left") },
		{ key = "l", mods = "ALT", action = wezterm.action.ActivatePaneDirection("Right") },
		{ key = "j", mods = "ALT", action = wezterm.action.ActivatePaneDirection("Down") },
		{ key = "k", mods = "ALT", action = wezterm.action.ActivatePaneDirection("Up") },
		-- Tab navigation
		{ key = "t", mods = "CTRL", action = wezterm.action.SpawnTab("CurrentPaneDomain") },
		{ key = "Tab", mods = "CTRL", action = wezterm.action.ActivateTabRelative(1) },
		{ key = "Tab", mods = "CTRL|SHIFT", action = wezterm.action.ActivateTabRelative(-1) },
		-- Copy mode for easier text selection
		{ key = "Enter", mods = "ALT", action = wezterm.action.ActivateCopyMode },
	},

	-- Hyperlink Rules (improved link detection for Neovim)
	hyperlink_rules = {
		-- Default rules for URLs
		{
			regex = [[(https?://\S+)]],
			format = "$1",
		},
		-- File paths
		{
			regex = [[(\w+://[\w.-]+/\S+)]],
			format = "$1",
		},
	},
}
