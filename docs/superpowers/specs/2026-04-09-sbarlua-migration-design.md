# SbarLua Migration Design

Migrate the SketchyBar configuration from shell scripts to SbarLua (Lua-based config with native IPC). Same layout and visual identity, improved internals, subtle animations, and a compiled C event provider for CPU.

## Architecture

### File Structure

```
sketchybar/.config/sketchybar/
  sketchybarrc              # #!/usr/bin/env lua — entry point
  init.lua                  # orchestrator: begin_config, require items, end_config, event_loop
  bar.lua                   # bar appearance (height, color, blur, position, etc.)
  default.lua               # default item properties (fonts, colors, padding)
  colors.lua                # Catppuccin Macchiato palette (returns table)
  icons.lua                 # SF Symbols + Nerd Font icon constants (returns table)
  settings.lua              # font families, sizes, padding values (returns table)
  items/
    init.lua                # requires all item modules
    apple.lua               # apple logo, left
    spaces.lua              # yabai spaces with per-space accent colors, left
    front_app.lua           # focused app name + icon, left
    playing.lua             # now playing indicator, center
    calendar.lua            # datetime + weather, right
    widgets/
      init.lua              # requires all widget modules
      battery.lua           # battery status, right
      volume.lua            # volume level, right
      wifi.lua              # wifi status, right
      cpu.lua               # CPU graph + C event provider, right
  helpers/
    init.lua                # package.cpath setup + compile C event providers
    app_icons.lua           # application -> sketchybar-app-font icon map (Lua table)
    event_providers/
      cpu_load/
        cpu_load.c          # C binary that pushes cpu_update events at 2s interval
        Makefile             # compiles cpu_load binary
```

### Deleted Files (replaced by Lua equivalents)

All current shell files are removed:

- `colors.sh` -> `colors.lua`
- `icon_map.sh` -> `helpers/app_icons.lua`
- `items/*.sh` -> `items/*.lua`
- `plugins/*.sh` -> inline Lua callbacks (no plugins directory)

### Module Patterns

**Constant modules** (`colors.lua`, `icons.lua`, `settings.lua`) return a table:
```lua
-- colors.lua
return {
  bar = { bg = 0xcc1e1e2e },
  item = 0xffcad3f5,
  -- ...
}
```

**Item modules** are side-effectful — they use the global `sbar` to create items and subscribe to events. They do not return anything.

**`sbar` is a global** set once in `init.lua`. All submodules reference it directly.

## Constants

### colors.lua — Catppuccin Macchiato

```lua
return {
  transparent = 0x00000000,
  bar = { bg = 0xcc1e1e2e },
  item = 0xffcad3f5,
  accent = 0xff363a4f,
  bracket = 0xff24273a,
  highlight = 0xff8aadf4,
  success = 0xffa6da95,
  warning = 0xffeed49f,
  danger = 0xffed8796,
  muted = 0xff6e738d,
  space = {
    active_bg = 0xff8aadf4,
    active_fg = 0xff1e1e2e,
    inactive_fg = 0xff6e738d,
    colors = {
      [1] = 0xff8aadf4, -- blue   (terminal)
      [2] = 0xffa6da95, -- green  (browser)
      [3] = 0xffc6a0f6, -- mauve  (chat)
      [4] = 0xfff5bde6, -- pink   (design)
      [5] = 0xff8bd5ca, -- teal   (misc)
    },
  },
  with_alpha = function(color, alpha)
    if alpha > 1.0 or alpha < 0.0 then return color end
    return (color & 0x00ffffff) | (math.floor(alpha * 255.0) << 24)
  end,
}
```

### settings.lua — Fonts & Dimensions

```lua
return {
  font = {
    text = "GeistMono Nerd Font",
    text_mono = "GeistMono Nerd Font Mono",
    icon = "SF Pro",
    app = "sketchybar-app-font",
  },
  bar = { height = 36 },
  item = {
    padding = 4,
    icon_padding_left = 6,
    icon_padding_right = 3,
    label_padding_left = 3,
    label_padding_right = 6,
  },
  bracket = {
    corner_radius = 12,
    height = 28,
  },
}
```

### icons.lua — Icon Constants

```lua
return {
  apple = "\u{f179}",           -- nf-fa-apple
  music = "\u{f001}",           -- nf-fa-music
  -- SF Symbols used inline as literal strings in item modules
}
```

## Items

### Bar (bar.lua)

```
height=36, color=bar.bg, blur_radius=30, position=top, sticky=on,
padding_left=8, padding_right=10, shadow=on, display=all
```

Identical to current config.

### Defaults (default.lua)

```
icon.font = "SF Pro:Semibold:14.0"
icon.color = colors.item
label.font = "GeistMono Nerd Font:Regular:12.0"
label.color = colors.item
background.drawing = off
padding_left = 4, padding_right = 4
icon.padding_left = 6, icon.padding_right = 3
label.padding_left = 3, label.padding_right = 6
```

Identical to current config.

### Apple (items/apple.lua)

Static item, left side. Apple Nerd Font icon in highlight color. Click opens Launchpad. No subscription needed.

No changes from current behavior.

### Spaces (items/spaces.lua)

Creates 5 space items (`space.1` through `space.5`) plus a hidden `space_updater` item.

**Improvements over shell version:**
- Yabai queries (`yabai -m query --spaces`, `yabai -m query --windows`) via `sbar.exec()` with callbacks — fully async, no blocking
- No PID file locking (`/tmp/sketchybar_space_update.pid` eliminated)
- Icon lookups via `require("helpers.app_icons")` table — no file-based icon cache
- Animate space background color transitions with `sbar.animate("tanh", 10, ...)`

**Events:** `space_change`, `window_focus`, `windows_on_spaces`, `front_app_switched`

**Behavior:** Active space gets solid background in its accent color with dark icon/label colors. Inactive spaces with windows show app icons in their accent color. Empty spaces are hidden. Identical visual result to current config.

### Front App (items/front_app.lua)

Left side, shows focused app name and icon in a pill background.

**Improvements:**
- Animate label: collapse width to 0, update text, expand back to dynamic — subtle transition on app switch
- Icon lookup via `app_icons` table directly, no shell script call

**Events:** `front_app_switched`

### Playing (items/playing.lua)

Center (position `e`), shows music icon when media is playing.

**Improvements:**
- `env.INFO` auto-parsed as Lua table — no `jq`
- Fade in/out via alpha animation instead of hard `drawing=on/off` toggle

**Events:** `media_change`

### Calendar (items/calendar.lua)

Right side. Shows formatted date/time and weather.

**Improvements:**
- `os.date()` for time formatting — no shell fork
- Weather fetched via `sbar.exec("curl -s 'wttr.in/?format=%c%t'", callback)` — async
- Weather cached in a local Lua variable, refreshed via `sbar.delay(1800, refresh_fn)` — no filesystem cache
- Graceful fallback if curl fails (just show date/time)

**Events:** `routine`, `forced`, `system_woke`

**Display format:** `"Mon 09 Apr · 11:27 AM · ☀️18°C"` (same as current)

### Battery (items/widgets/battery.lua)

Right side, in connectivity bracket.

**Improvements:**
- `sbar.exec("pmset -g batt", callback)` — async
- Same icon/color thresholds, same SF Symbols

**Events:** `routine`, `power_source_change`, `system_woke`

### Volume (items/widgets/volume.lua)

Right side, in connectivity bracket.

`env.INFO` gives volume percentage directly. Same icon thresholds (SF Symbols). No changes to behavior.

**Events:** `volume_change`

### Wifi (items/widgets/wifi.lua)

Right side, in connectivity bracket.

**Improvements:**
- `sbar.exec()` for SSID query — async instead of blocking `system_profiler` call

**Events:** `wifi_change`

### CPU (items/widgets/cpu.lua)

Right side, graph item with 30-width. Own bracket background (separate from connectivity).

**Improvements:**
- C event provider (`helpers/event_providers/cpu_load/`) pushes `cpu_update` events every 2 seconds
- No shell forking for CPU measurement
- Animate graph color transitions between highlight/warning/danger thresholds

**Events:** `cpu_update` (custom, from C provider)

**Provider auto-start:** `helpers/init.lua` compiles the provider (`make`), `cpu.lua` launches it via `sbar.exec()` on load.

### Connectivity Bracket

Groups volume, battery, wifi in a pill background. Same visual as current:
```
background.color = colors.bracket
background.corner_radius = 12
background.height = 28
```

## Animations

All animations use `sbar.animate("tanh", duration, fn)`:

| Item | Trigger | Animation | Duration (frames) |
|------|---------|-----------|-------------------|
| Spaces | space_change | Background color + icon color transition | 10 |
| Front App | front_app_switched | Label width collapse/expand | 8 |
| Playing | media_change (play) | Alpha 0 -> 1 fade in | 15 |
| Playing | media_change (stop) | Alpha 1 -> 0 fade out | 15 |
| CPU graph | threshold crossing | Graph color transition | 20 |

## C Event Provider

### cpu_load.c

A small C program that:
1. Reads CPU usage from `host_processor_info()` (Mach kernel API)
2. Calculates total load percentage
3. Fires a `cpu_update` SketchyBar event with `total_load` env var
4. Sleeps for the configured interval (2 seconds)
5. Loops indefinitely

Based on FelixKratz's reference implementation.

### Makefile

```makefile
CFLAGS = -std=c99 -O2
SRC = cpu_load.c
BIN = bin/cpu_load

all: $(BIN)

$(BIN): $(SRC)
	mkdir -p bin
	$(CC) $(CFLAGS) -o $@ $<

clean:
	rm -rf bin
```

### Lifecycle

- `helpers/init.lua` runs `os.execute("cd helpers/event_providers/cpu_load && make")` on config load
- `cpu.lua` starts the provider: `sbar.exec("killall cpu_load 2>/dev/null; $CONFIG_DIR/helpers/event_providers/cpu_load/bin/cpu_load cpu_update 2.0")`
- Provider runs as a background process, killed on SketchyBar restart

## helpers/app_icons.lua

The 792-line `icon_map.sh` case statement becomes a Lua table:

```lua
-- Current shell:
-- "Ghostty") icon_result=":ghostty:" ;;
-- Becomes:
-- ["Ghostty"] = ":ghostty:",

local app_icons = {
  ["Ghostty"] = ":ghostty:",
  ["Safari"] = ":safari:",
  ["Discord"] = ":discord:",
  -- ... ~500 entries
}

return function(app_name)
  return app_icons[app_name] or ":default:"
end
```

Direct O(1) table lookup instead of shell case statement + file cache.

## Config Lifecycle

```
sketchybarrc (shebang: #!/usr/bin/env lua)
  -> require("helpers")       -- set package.cpath, compile C providers
  -> require("init")
       -> sbar = require("sketchybar")
       -> sbar.begin_config()
       -> require("bar")       -- bar appearance
       -> require("default")   -- default item props
       -> require("items")     -- all items created + subscribed
       -> sbar.end_config()    -- flush all config in one IPC message
       -> sbar.event_loop()    -- start processing callbacks
```

## Installation

SbarLua requires a one-time compile step (not in Homebrew):

```bash
git clone https://github.com/FelixKratz/SbarLua.git /tmp/SbarLua \
  && cd /tmp/SbarLua \
  && make install \
  && rm -rf /tmp/SbarLua
```

This places the compiled module at `~/.local/share/sketchybar_lua/sketchybar.so`.

No Brewfile changes needed. SketchyBar itself stays as the brew formula.

## Migration Checklist

1. Install SbarLua (`make install`)
2. Create `colors.lua`, `icons.lua`, `settings.lua` constant modules
3. Create `bar.lua` and `default.lua`
4. Create `helpers/init.lua` and `helpers/app_icons.lua`
5. Create C event provider (`helpers/event_providers/cpu_load/`)
6. Create all item modules (`items/`)
7. Create `init.lua` orchestrator and `sketchybarrc` entry point
8. Remove all old `.sh` files
9. Restart SketchyBar and verify
10. Test each item: spaces switching, front app, media, battery, volume, wifi, cpu graph, weather, click actions
