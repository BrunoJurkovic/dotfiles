# SbarLua Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate SketchyBar from shell scripts to SbarLua — same visual identity, improved async internals, subtle animations, C event provider for CPU.

**Architecture:** Lua module tree rooted at `sketchybarrc`. Global `sbar` set in entry point, constant modules return tables, item modules are side-effectful. C event provider for CPU polling via Mach kernel API. All 23 shell files replaced.

**Tech Stack:** SbarLua (Lua 5.4 via SketchyBar's embedded runtime), C99 (cpu event provider), SketchyBar IPC

**Spec:** `docs/superpowers/specs/2026-04-09-sbarlua-migration-design.md`

---

### Task 1: Install SbarLua

**Files:**
- None (system-level install)

- [ ] **Step 1: Clone and compile SbarLua**

```bash
git clone https://github.com/FelixKratz/SbarLua.git /tmp/SbarLua && cd /tmp/SbarLua && make install && rm -rf /tmp/SbarLua
```

Expected: compiles and installs to `~/.local/share/sketchybar_lua/sketchybar.so`

- [ ] **Step 2: Verify installation**

```bash
ls -la ~/.local/share/sketchybar_lua/sketchybar.so
```

Expected: file exists

---

### Task 2: Create constant modules (colors, icons, settings)

**Files:**
- Create: `sketchybar/.config/sketchybar/colors.lua`
- Create: `sketchybar/.config/sketchybar/icons.lua`
- Create: `sketchybar/.config/sketchybar/settings.lua`

- [ ] **Step 1: Create colors.lua**

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

- [ ] **Step 2: Create icons.lua**

```lua
return {
  apple = "\u{f179}",    -- nf-fa-apple
  music = "\u{f001}",    -- nf-fa-music
  cpu   = "􀧓",           -- SF Symbol: cpu
  vol = {
    _100 = "􀊩",
    _66  = "􀊩",
    _33  = "􀊥",
    _10  = "􀊡",
    _0   = "􀊣",
  },
  battery = {
    _100     = "􀛨",
    _75      = "􀺸",
    _50      = "􀺶",
    _25      = "􀛩",
    _0       = "􀛪",
    charging = "􀢋",
  },
  wifi = {
    connected    = "􀙇",
    disconnected = "􀙈",
  },
}
```

- [ ] **Step 3: Create settings.lua**

```lua
return {
  font = {
    text      = "GeistMono Nerd Font",
    text_mono = "GeistMono Nerd Font Mono",
    icon      = "SF Pro",
    app       = "sketchybar-app-font",
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

- [ ] **Step 4: Commit**

```bash
git add sketchybar/.config/sketchybar/colors.lua sketchybar/.config/sketchybar/icons.lua sketchybar/.config/sketchybar/settings.lua
git commit -m "feat: add SbarLua constant modules (colors, icons, settings)"
```

---

### Task 3: Create bar.lua and default.lua

**Files:**
- Create: `sketchybar/.config/sketchybar/bar.lua`
- Create: `sketchybar/.config/sketchybar/default.lua`

- [ ] **Step 1: Create bar.lua**

```lua
local colors = require("colors")
local settings = require("settings")

sbar.bar({
  height = settings.bar.height,
  color = colors.bar.bg,
  blur_radius = 30,
  position = "top",
  sticky = true,
  padding_left = 8,
  padding_right = 10,
  shadow = true,
  display = "all",
})
```

- [ ] **Step 2: Create default.lua**

```lua
local colors = require("colors")
local settings = require("settings")

sbar.default({
  icon = {
    font = { family = settings.font.icon, style = "Semibold", size = 14.0 },
    color = colors.item,
    padding_left = settings.item.icon_padding_left,
    padding_right = settings.item.icon_padding_right,
  },
  label = {
    font = { family = settings.font.text, style = "Regular", size = 12.0 },
    color = colors.item,
    padding_left = settings.item.label_padding_left,
    padding_right = settings.item.label_padding_right,
  },
  background = { drawing = false },
  padding_left = settings.item.padding,
  padding_right = settings.item.padding,
})
```

- [ ] **Step 3: Commit**

```bash
git add sketchybar/.config/sketchybar/bar.lua sketchybar/.config/sketchybar/default.lua
git commit -m "feat: add SbarLua bar and default config"
```

---

### Task 4: Create helpers (init.lua, app_icons.lua)

**Files:**
- Create: `sketchybar/.config/sketchybar/helpers/init.lua`
- Create: `sketchybar/.config/sketchybar/helpers/app_icons.lua`

- [ ] **Step 1: Create helpers/init.lua**

```lua
-- Add SbarLua module to package search path
package.cpath = package.cpath
  .. ";/Users/" .. os.getenv("USER")
  .. "/.local/share/sketchybar_lua/?.so"

-- Compile C event providers (silently fail if missing toolchain)
local config_dir = os.getenv("CONFIG_DIR")
  or os.getenv("HOME") .. "/.config/sketchybar"
os.execute("(cd " .. config_dir .. "/helpers/event_providers/cpu_load && make 2>/dev/null)")
```

- [ ] **Step 2: Convert icon_map.sh to app_icons.lua**

Run this conversion command to auto-generate the Lua table from the shell case statement:

```bash
cd $HOME/.dotfiles/sketchybar/.config/sketchybar
awk '
  /icon_result=/ {
    gsub(/^[[:space:]]+/, "", prev)
    gsub(/"/, "", prev)
    gsub(/\)$/, "", prev)

    match($0, /icon_result="([^"]+)"/, arr)
    if (arr[1] != "" && prev != "") {
      # Handle wildcard patterns: "Adobe Bridge"* -> ["Adobe Bridge"] with comment
      wildcard = ""
      if (match(prev, /\*$/)) {
        sub(/\*$/, "", prev)
        wildcard = " -- prefix match in shell, exact match in lua"
      }
      entries[++n] = "  [\"" prev "\"] = \"" arr[1] "\"," wildcard
    }
  }
  { prev = $0 }
  END {
    print "local app_icons = {"
    for (i = 1; i <= n; i++) print entries[i]
    print "}"
    print ""
    print "return function(app_name)"
    print "  return app_icons[app_name] or \":default:\""
    print "end"
  }
' icon_map.sh > helpers/app_icons.lua
```

Verify the output has ~261 entries:

```bash
grep -c '^\s*\[' helpers/app_icons.lua
```

Expected: ~261

- [ ] **Step 3: Review generated app_icons.lua**

Read the first and last 10 lines to verify structure:

```bash
head -12 helpers/app_icons.lua && echo "..." && tail -6 helpers/app_icons.lua
```

Expected: starts with `local app_icons = {`, entries look like `["App Name"] = ":icon:",`, ends with `return function(app_name)`.

- [ ] **Step 4: Commit**

```bash
git add sketchybar/.config/sketchybar/helpers/
git commit -m "feat: add SbarLua helpers (init, app_icons)"
```

---

### Task 5: Create C event provider for CPU

**Files:**
- Create: `sketchybar/.config/sketchybar/helpers/event_providers/cpu_load/cpu.h`
- Create: `sketchybar/.config/sketchybar/helpers/event_providers/cpu_load/cpu_load.c`
- Create: `sketchybar/.config/sketchybar/helpers/event_providers/cpu_load/makefile`
- Create: `sketchybar/.config/sketchybar/helpers/event_providers/sketchybar.h`
- Create: `sketchybar/.config/sketchybar/helpers/event_providers/makefile`

- [ ] **Step 1: Create sketchybar.h (IPC header)**

This is FelixKratz's reference Mach IPC header used by all event providers:

```c
#pragma once

#include <mach/arm/kern_return.h>
#include <mach/mach.h>
#include <mach/mach_port.h>
#include <mach/message.h>
#include <bootstrap.h>
#include <stdlib.h>
#include <pthread.h>
#include <stdio.h>

typedef char* env;

#define MACH_HANDLER(name) void name(env env)
typedef MACH_HANDLER(mach_handler);

struct mach_message {
  mach_msg_header_t header;
  mach_msg_size_t msgh_descriptor_count;
  mach_msg_ool_descriptor_t descriptor;
};

struct mach_buffer {
  struct mach_message message;
  mach_msg_trailer_t trailer;
};

static mach_port_t g_mach_port = 0;

static inline mach_port_t mach_get_bs_port() {
  mach_port_name_t task = mach_task_self();

  mach_port_t bs_port;
  if (task_get_special_port(task,
                            TASK_BOOTSTRAP_PORT,
                            &bs_port            ) != KERN_SUCCESS) {
    return 0;
  }

  char* name = getenv("BAR_NAME");
  if (!name) name = "sketchybar";
  uint32_t lookup_len = 16 + strlen(name);

  char buffer[lookup_len];
  snprintf(buffer, lookup_len, "git.felix.%s", name);

  mach_port_t port;
  if (bootstrap_look_up(bs_port, buffer, &port) != KERN_SUCCESS) return 0;
  return port;
}

static inline bool mach_send_message(mach_port_t port, char* message, uint32_t len) {
  if (!message || !port) {
    return false;
  }

  struct mach_message msg = { 0 };
  msg.header.msgh_remote_port = port;
  msg.header.msgh_local_port = 0;
  msg.header.msgh_id = 0;
  msg.header.msgh_bits = MACH_MSGH_BITS_SET(MACH_MSG_TYPE_COPY_SEND,
                                            MACH_MSG_TYPE_MAKE_SEND,
                                            0,
                                            MACH_MSGH_BITS_COMPLEX       );

  msg.header.msgh_size = sizeof(struct mach_message);
  msg.msgh_descriptor_count = 1;
  msg.descriptor.address = message;
  msg.descriptor.size = len * sizeof(char);
  msg.descriptor.copy = MACH_MSG_VIRTUAL_COPY;
  msg.descriptor.deallocate = false;
  msg.descriptor.type = MACH_MSG_OOL_DESCRIPTOR;

  kern_return_t err = mach_msg(&msg.header,
                               MACH_SEND_MSG,
                               sizeof(struct mach_message),
                               0,
                               MACH_PORT_NULL,
                               MACH_MSG_TIMEOUT_NONE,
                               MACH_PORT_NULL              );

  return err == KERN_SUCCESS;
}

static inline uint32_t format_message(char* message, char* formatted_message) {
  char outer_quote = 0;
  uint32_t caret = 0;
  uint32_t message_length = strlen(message) + 1;
  for (int i = 0; i < message_length; ++i) {
    if (message[i] == '"' || message[i] == '\'') {
      if (outer_quote && outer_quote == message[i]) outer_quote = 0;
      else if (!outer_quote) outer_quote = message[i];
      continue;
    }
    formatted_message[caret] = message[i];
    if (message[i] == ' ' && !outer_quote) formatted_message[caret] = '\0';
    caret++;
  }

  if (caret > 0 && formatted_message[caret] == '\0'
      && formatted_message[caret - 1] == '\0') {
    caret--;
  }
  formatted_message[caret] = '\0';
  return caret + 1;
}

static inline void sketchybar(char* message) {
  char formatted_message[strlen(message) + 2];
  uint32_t length = format_message(message, formatted_message);
  if (!length) return;

  if (!g_mach_port) g_mach_port = mach_get_bs_port();
  if (!mach_send_message(g_mach_port, formatted_message, length)) {
    g_mach_port = mach_get_bs_port();
    if (!mach_send_message(g_mach_port, formatted_message, length)) {
      exit(0);
    }
  }
}
```

- [ ] **Step 2: Create cpu.h**

```c
#include <mach/mach.h>
#include <stdbool.h>
#include <unistd.h>
#include <stdio.h>

struct cpu {
  host_t host;
  mach_msg_type_number_t count;
  host_cpu_load_info_data_t load;
  host_cpu_load_info_data_t prev_load;
  bool has_prev_load;

  int user_load;
  int sys_load;
  int total_load;
};

static inline void cpu_init(struct cpu* cpu) {
  cpu->host = mach_host_self();
  cpu->count = HOST_CPU_LOAD_INFO_COUNT;
  cpu->has_prev_load = false;
}

static inline void cpu_update(struct cpu* cpu) {
  kern_return_t error = host_statistics(cpu->host,
                                        HOST_CPU_LOAD_INFO,
                                        (host_info_t)&cpu->load,
                                        &cpu->count                );

  if (error != KERN_SUCCESS) {
    printf("Error: Could not read cpu host statistics.\n");
    return;
  }

  if (cpu->has_prev_load) {
    uint32_t delta_user = cpu->load.cpu_ticks[CPU_STATE_USER]
                          - cpu->prev_load.cpu_ticks[CPU_STATE_USER];

    uint32_t delta_system = cpu->load.cpu_ticks[CPU_STATE_SYSTEM]
                            - cpu->prev_load.cpu_ticks[CPU_STATE_SYSTEM];

    uint32_t delta_idle = cpu->load.cpu_ticks[CPU_STATE_IDLE]
                          - cpu->prev_load.cpu_ticks[CPU_STATE_IDLE];

    cpu->user_load = (double)delta_user / (double)(delta_system
                                                     + delta_user
                                                     + delta_idle) * 100.0;

    cpu->sys_load = (double)delta_system / (double)(delta_system
                                                      + delta_user
                                                      + delta_idle) * 100.0;

    cpu->total_load = cpu->user_load + cpu->sys_load;
  }

  cpu->prev_load = cpu->load;
  cpu->has_prev_load = true;
}
```

- [ ] **Step 3: Create cpu_load.c**

```c
#include "cpu.h"
#include "../sketchybar.h"

int main (int argc, char** argv) {
  float update_freq;
  if (argc < 3 || (sscanf(argv[2], "%f", &update_freq) != 1)) {
    printf("Usage: %s \"<event-name>\" \"<event_freq>\"\n", argv[0]);
    exit(1);
  }

  alarm(0);
  struct cpu cpu;
  cpu_init(&cpu);

  char event_message[512];
  snprintf(event_message, 512, "--add event '%s'", argv[1]);
  sketchybar(event_message);

  char trigger_message[512];
  for (;;) {
    cpu_update(&cpu);

    snprintf(trigger_message,
             512,
             "--trigger '%s' user_load='%d' sys_load='%02d' total_load='%02d'",
             argv[1],
             cpu.user_load,
             cpu.sys_load,
             cpu.total_load                                        );

    sketchybar(trigger_message);
    usleep(update_freq * 1000000);
  }
  return 0;
}
```

- [ ] **Step 4: Create cpu_load/makefile**

```makefile
bin/cpu_load: cpu_load.c cpu.h ../sketchybar.h | bin
	clang -std=c99 -O3 $< -o $@

bin:
	mkdir bin
```

- [ ] **Step 5: Create event_providers/makefile**

```makefile
all:
	(cd cpu_load && $(MAKE))
```

- [ ] **Step 6: Compile and verify**

```bash
cd $HOME/.dotfiles/sketchybar/.config/sketchybar/helpers/event_providers/cpu_load && make
ls -la bin/cpu_load
```

Expected: binary compiled successfully at `bin/cpu_load`

- [ ] **Step 7: Commit**

```bash
git add sketchybar/.config/sketchybar/helpers/event_providers/
git commit -m "feat: add C event provider for CPU load monitoring"
```

---

### Task 6: Create left-side items (apple, spaces, front_app)

**Files:**
- Create: `sketchybar/.config/sketchybar/items/apple.lua`
- Create: `sketchybar/.config/sketchybar/items/spaces.lua`
- Create: `sketchybar/.config/sketchybar/items/front_app.lua`

- [ ] **Step 1: Create items/apple.lua**

```lua
local colors = require("colors")
local icons = require("icons")
local settings = require("settings")

local apple = sbar.add("item", "apple", {
  icon = {
    string = icons.apple,
    font = { family = settings.font.text_mono, style = "Bold", size = 16.0 },
    color = colors.highlight,
    padding_left = 8,
    padding_right = 6,
  },
  label = { drawing = false },
  click_script = "open -a Launchpad",
})
```

- [ ] **Step 2: Create items/spaces.lua**

```lua
local colors = require("colors")
local settings = require("settings")
local app_icons = require("helpers.app_icons")

local spaces = {}

-- Register custom events
sbar.add("event", "space_change")
sbar.add("event", "window_focus")
sbar.add("event", "windows_on_spaces")

for i = 1, 5 do
  local space = sbar.add("space", "space." .. i, {
    associated_space = i,
    icon = {
      string = tostring(i),
      font = { family = settings.font.text_mono, style = "Bold", size = 13.0 },
      color = colors.space.inactive_fg,
      padding_left = 9,
      padding_right = 4,
    },
    label = {
      font = { family = settings.font.app, style = "Regular", size = 14.0 },
      color = colors.space.inactive_fg,
      padding_left = 0,
      padding_right = 9,
      y_offset = -1,
    },
    background = {
      color = colors.transparent,
      corner_radius = 10,
      height = 26,
      drawing = false,
    },
    click_script = "yabai -m space --focus " .. i,
  })

  spaces[i] = space
end

local function update_spaces()
  sbar.exec("yabai -m query --spaces", function(spaces_json)
    local focused = nil
    if type(spaces_json) == "table" then
      for _, s in ipairs(spaces_json) do
        if s["has-focus"] then
          focused = s.index
          break
        end
      end
    end

    if not focused then return end

    sbar.exec("yabai -m query --windows", function(windows_json)
      if type(windows_json) ~= "table" then return end

      -- Build per-space app lists
      local space_apps = {}
      for sid = 1, 5 do space_apps[sid] = {} end

      for _, win in ipairs(windows_json) do
        local sid = win.space
        if sid >= 1 and sid <= 5 and win.app then
          space_apps[sid][win.app] = true
        end
      end

      -- Build batched update
      for sid = 1, 5 do
        local color = colors.space.colors[sid] or colors.highlight
        local apps = space_apps[sid]
        local has_apps = next(apps) ~= nil

        -- Build icon strip
        local icon_strip = ""
        if has_apps then
          for app_name, _ in pairs(apps) do
            icon_strip = icon_strip .. " " .. app_icons(app_name)
          end
        end

        if sid == focused then
          sbar.animate("tanh", 10, function()
            spaces[sid]:set({
              icon = { color = colors.space.active_fg },
              label = { string = icon_strip, color = colors.space.active_fg },
              background = { drawing = true, color = color },
              drawing = true,
            })
          end)
        elseif has_apps then
          sbar.animate("tanh", 10, function()
            spaces[sid]:set({
              icon = { color = color },
              label = { string = icon_strip, color = colors.space.inactive_fg },
              background = { drawing = false },
              drawing = true,
            })
          end)
        else
          spaces[sid]:set({ drawing = false })
        end
      end
    end)
  end)
end

-- Subscribe all spaces to update events
for i = 1, 5 do
  spaces[i]:subscribe({
    "space_change",
    "window_focus",
    "windows_on_spaces",
    "front_app_switched",
  }, update_spaces)
end
```

- [ ] **Step 3: Create items/front_app.lua**

```lua
local colors = require("colors")
local settings = require("settings")
local app_icons = require("helpers.app_icons")

local front_app = sbar.add("item", "front_app", {
  position = "left",
  icon = {
    font = { family = settings.font.app, style = "Regular", size = 14.0 },
    color = colors.item,
  },
  label = {
    font = { family = settings.font.text, style = "Medium", size = 12.0 },
    color = colors.item,
  },
  background = {
    color = colors.accent,
    corner_radius = 10,
    height = 24,
    drawing = true,
  },
  click_script = "open -a 'Mission Control'",
})

front_app:subscribe("front_app_switched", function(env)
  sbar.animate("tanh", 8, function()
    front_app:set({
      label = { string = env.INFO },
      icon = { string = app_icons(env.INFO) },
    })
  end)
end)
```

- [ ] **Step 4: Commit**

```bash
git add sketchybar/.config/sketchybar/items/apple.lua sketchybar/.config/sketchybar/items/spaces.lua sketchybar/.config/sketchybar/items/front_app.lua
git commit -m "feat: add SbarLua left-side items (apple, spaces, front_app)"
```

---

### Task 7: Create center item (playing)

**Files:**
- Create: `sketchybar/.config/sketchybar/items/playing.lua`

- [ ] **Step 1: Create items/playing.lua**

```lua
local colors = require("colors")
local icons = require("icons")
local settings = require("settings")

local playing = sbar.add("item", "playing", {
  position = "e",
  icon = {
    string = icons.music,
    font = { family = settings.font.text_mono, style = "Regular", size = 12.0 },
    color = colors.success,
    padding_left = 4,
    padding_right = 4,
  },
  label = { drawing = false },
  drawing = false,
})

playing:subscribe("media_change", function(env)
  local state = (type(env.INFO) == "table") and env.INFO.state or env.INFO

  if state == "playing" then
    sbar.animate("tanh", 15, function()
      playing:set({ drawing = true })
    end)
  else
    sbar.animate("tanh", 15, function()
      playing:set({ drawing = false })
    end)
  end
end)
```

- [ ] **Step 2: Commit**

```bash
git add sketchybar/.config/sketchybar/items/playing.lua
git commit -m "feat: add SbarLua playing item with fade animation"
```

---

### Task 8: Create right-side items (calendar, widgets, bracket)

**Files:**
- Create: `sketchybar/.config/sketchybar/items/calendar.lua`
- Create: `sketchybar/.config/sketchybar/items/widgets/init.lua`
- Create: `sketchybar/.config/sketchybar/items/widgets/battery.lua`
- Create: `sketchybar/.config/sketchybar/items/widgets/volume.lua`
- Create: `sketchybar/.config/sketchybar/items/widgets/wifi.lua`
- Create: `sketchybar/.config/sketchybar/items/widgets/cpu.lua`

- [ ] **Step 1: Create items/calendar.lua**

```lua
local colors = require("colors")
local settings = require("settings")

local weather_cache = { text = "", last_fetch = 0 }

local calendar = sbar.add("item", "calendar", {
  position = "right",
  update_freq = 30,
  icon = { drawing = false },
  label = {
    font = { family = settings.font.text, style = "Medium", size = 12.0 },
    padding_left = 10,
    padding_right = 10,
  },
  background = {
    color = colors.bracket,
    corner_radius = settings.bracket.corner_radius,
    height = settings.bracket.height,
    drawing = true,
  },
  click_script = "open -a Calendar",
})

local function update_label()
  local datetime = os.date("%a %d %b · %I:%M %p")
  if weather_cache.text ~= "" then
    calendar:set({ label = { string = datetime .. " · " .. weather_cache.text } })
  else
    calendar:set({ label = { string = datetime } })
  end
end

local function fetch_weather()
  sbar.exec("curl -s 'wttr.in/?format=%c%t' 2>/dev/null | head -1 | sed 's/+//'", function(result)
    if result and result ~= "" and not result:find("Unknown") and not result:find("curl") then
      weather_cache.text = result:gsub("%s+$", "")
      weather_cache.last_fetch = os.time()
    end
    update_label()
  end)
end

calendar:subscribe({ "routine", "forced", "system_woke" }, function(env)
  -- Refresh weather every 30 minutes
  if os.time() - weather_cache.last_fetch > 1800 then
    fetch_weather()
  else
    update_label()
  end
end)

-- Initial weather fetch
fetch_weather()
```

- [ ] **Step 2: Create items/widgets/volume.lua**

```lua
local colors = require("colors")
local icons = require("icons")
local settings = require("settings")

local volume = sbar.add("item", "volume", {
  position = "right",
  icon = { padding_left = 10 },
  label = {
    font = { family = settings.font.text_mono, style = "Regular", size = 11.0 },
  },
  padding_right = 2,
  click_script = "open x-apple.systempreferences:com.apple.preference.sound",
})

volume:subscribe("volume_change", function(env)
  local vol = tonumber(env.INFO)
  local icon = icons.vol._0

  if vol >= 60 then
    icon = icons.vol._100
  elseif vol >= 30 then
    icon = icons.vol._33
  elseif vol >= 1 then
    icon = icons.vol._10
  end

  volume:set({
    icon = { string = icon },
    label = { string = vol .. "%" },
  })
end)
```

- [ ] **Step 3: Create items/widgets/battery.lua**

```lua
local colors = require("colors")
local icons = require("icons")
local settings = require("settings")

local battery = sbar.add("item", "battery", {
  position = "right",
  update_freq = 180,
  label = {
    font = { family = settings.font.text_mono, style = "Regular", size = 11.0 },
  },
  padding_left = 2,
  padding_right = 2,
  click_script = "open x-apple.systempreferences:com.apple.preference.battery",
})

battery:subscribe({ "routine", "power_source_change", "system_woke" }, function(env)
  sbar.exec("pmset -g batt", function(batt_info)
    local found, _, charge = batt_info:find("(%d+)%%")
    if not found then return end

    local charge_num = tonumber(charge)
    local charging = batt_info:find("AC Power") ~= nil

    local icon = icons.battery._0
    local color = colors.danger

    if charging then
      icon = icons.battery.charging
      color = colors.success
    elseif charge_num >= 90 then
      icon = icons.battery._100
      color = colors.success
    elseif charge_num >= 50 then
      icon = icons.battery._75
      color = colors.item
    elseif charge_num >= 30 then
      icon = icons.battery._50
      color = colors.item
    elseif charge_num >= 10 then
      icon = icons.battery._25
      color = colors.warning
    end

    battery:set({
      icon = { string = icon, color = color },
      label = { string = charge .. "%" },
    })
  end)
end)
```

- [ ] **Step 4: Create items/widgets/wifi.lua**

```lua
local icons = require("icons")

local wifi = sbar.add("item", "wifi", {
  position = "right",
  icon = { string = icons.wifi.connected },
  label = { drawing = false },
  padding_left = 2,
  click_script = "open x-apple.systempreferences:com.apple.preference.network",
})

wifi:subscribe("wifi_change", function(env)
  sbar.exec("system_profiler SPAirPortDataType | awk '/Current Network Information:/ { getline; print substr($0, 13, (length($0) - 13)); exit }'", function(ssid)
    if ssid and ssid ~= "" then
      wifi:set({ icon = { string = icons.wifi.connected } })
    else
      wifi:set({ icon = { string = icons.wifi.disconnected } })
    end
  end)
end)
```

- [ ] **Step 5: Create items/widgets/cpu.lua**

```lua
local colors = require("colors")
local icons = require("icons")
local settings = require("settings")

local cpu = sbar.add("graph", "cpu", 30, {
  position = "right",
  graph = {
    color = colors.highlight,
    fill_color = colors.with_alpha(colors.highlight, 0.2),
    line_width = 1.5,
  },
  icon = {
    string = icons.cpu,
    font = { family = settings.font.icon, style = "Semibold", size = 12.0 },
    color = colors.item,
    padding_left = 14,
    padding_right = 4,
  },
  label = {
    font = { family = settings.font.text_mono, style = "Regular", size = 11.0 },
    color = colors.item,
    padding_left = 4,
    padding_right = 14,
  },
  width = 90,
  padding_left = 0,
  padding_right = 0,
  background = {
    color = colors.bracket,
    corner_radius = settings.bracket.corner_radius,
    height = settings.bracket.height,
    drawing = true,
  },
  click_script = "open -na /Applications/Ghostty.app --args -e btop",
})

-- Try to start C event provider, fall back to shell polling
local config_dir = os.getenv("CONFIG_DIR")
  or os.getenv("HOME") .. "/.config/sketchybar"
local provider_bin = config_dir .. "/helpers/event_providers/cpu_load/bin/cpu_load"

local function update_cpu(load)
  local normalized = load / 100
  local color = colors.highlight

  if load > 80 then
    color = colors.danger
  elseif load > 50 then
    color = colors.warning
  end

  sbar.animate("tanh", 20, function()
    cpu:set({
      graph = { color = color },
      label = { string = math.floor(load) .. "%" },
    })
  end)
  cpu:push({ normalized })
end

-- Check if the provider binary exists
sbar.exec("test -x " .. provider_bin .. " && echo yes || echo no", function(result)
  if result and result:gsub("%s+", "") == "yes" then
    -- Use C event provider
    sbar.exec("killall cpu_load 2>/dev/null; " .. provider_bin .. " cpu_update 2.0")
    cpu:subscribe("cpu_update", function(env)
      update_cpu(tonumber(env.total_load) or 0)
    end)
  else
    -- Fallback: shell polling
    cpu:set({ update_freq = 5 })
    cpu:subscribe("routine", function(env)
      sbar.exec("ps -eo pcpu | awk -v cores=$(sysctl -n machdep.cpu.thread_count) '{sum+=$1} END {printf \"%.0f\", sum/cores}'", function(result)
        update_cpu(tonumber(result) or 0)
      end)
    end)
  end
end)
```

- [ ] **Step 6: Create items/widgets/init.lua**

```lua
require("items.widgets.volume")
require("items.widgets.battery")
require("items.widgets.wifi")
require("items.widgets.cpu")
```

- [ ] **Step 7: Commit**

```bash
git add sketchybar/.config/sketchybar/items/calendar.lua sketchybar/.config/sketchybar/items/widgets/
git commit -m "feat: add SbarLua right-side items (calendar, volume, battery, wifi, cpu)"
```

---

### Task 9: Create entry point, orchestrator, and items init

**Files:**
- Create: `sketchybar/.config/sketchybar/items/init.lua`
- Create: `sketchybar/.config/sketchybar/init.lua`
- Modify: `sketchybar/.config/sketchybar/sketchybarrc` (replace entire file)

- [ ] **Step 1: Create items/init.lua**

```lua
-- Left side
require("items.apple")
require("items.spaces")
require("items.front_app")

-- Center
require("items.playing")

-- Right side (rightmost first)
require("items.calendar")
require("items.widgets")

-- Brackets
local colors = require("colors")
local settings = require("settings")

sbar.add("bracket", "connectivity", { "volume", "battery", "wifi" }, {
  background = {
    color = colors.bracket,
    corner_radius = settings.bracket.corner_radius,
    height = settings.bracket.height,
    drawing = true,
  },
})
```

- [ ] **Step 2: Create init.lua**

```lua
sbar = require("sketchybar")

sbar.begin_config()
require("bar")
require("default")
require("items")
sbar.end_config()

sbar.event_loop()
```

- [ ] **Step 3: Replace sketchybarrc**

Replace the entire contents of `sketchybarrc` with:

```lua
require("helpers")
require("init")
```

This is the entry point. SketchyBar executes it as Lua directly (the embedded Lua runtime). `helpers` sets up `package.cpath` and compiles C providers. `init` sets the global `sbar`, configures everything, and starts the event loop.

- [ ] **Step 4: Commit**

```bash
git add sketchybar/.config/sketchybar/items/init.lua sketchybar/.config/sketchybar/init.lua sketchybar/.config/sketchybar/sketchybarrc
git commit -m "feat: add SbarLua entry point and orchestrator"
```

---

### Task 10: Remove old shell files

**Files:**
- Delete: `sketchybar/.config/sketchybar/colors.sh`
- Delete: `sketchybar/.config/sketchybar/icon_map.sh`
- Delete: `sketchybar/.config/sketchybar/items/apple.sh`
- Delete: `sketchybar/.config/sketchybar/items/spaces.sh`
- Delete: `sketchybar/.config/sketchybar/items/front_app.sh`
- Delete: `sketchybar/.config/sketchybar/items/playing.sh`
- Delete: `sketchybar/.config/sketchybar/items/datetime.sh`
- Delete: `sketchybar/.config/sketchybar/items/battery.sh`
- Delete: `sketchybar/.config/sketchybar/items/volume.sh`
- Delete: `sketchybar/.config/sketchybar/items/wifi.sh`
- Delete: `sketchybar/.config/sketchybar/items/cpu.sh`
- Delete: `sketchybar/.config/sketchybar/plugins/` (entire directory)

- [ ] **Step 1: Remove all shell files**

```bash
cd $HOME/.dotfiles/sketchybar/.config/sketchybar
rm colors.sh icon_map.sh
rm items/apple.sh items/spaces.sh items/front_app.sh items/playing.sh items/datetime.sh items/battery.sh items/volume.sh items/wifi.sh items/cpu.sh
rm -r plugins/
```

- [ ] **Step 2: Verify only Lua files remain**

```bash
find $HOME/.dotfiles/sketchybar/.config/sketchybar -type f | sort
```

Expected: only `.lua`, `.c`, `.h`, `makefile`, `sketchybarrc` files. No `.sh` files.

- [ ] **Step 3: Commit**

```bash
git add -A sketchybar/.config/sketchybar/
git commit -m "chore: remove old shell-based sketchybar config"
```

---

### Task 11: Restart and verify

- [ ] **Step 1: Restart SketchyBar**

```bash
brew services restart sketchybar
```

Wait 3 seconds for it to initialize.

- [ ] **Step 2: Check SketchyBar is running**

```bash
pgrep -l sketchybar
```

Expected: sketchybar process running

- [ ] **Step 3: Verify CPU provider is running**

```bash
pgrep -l cpu_load
```

Expected: cpu_load process running

- [ ] **Step 4: Manual verification checklist**

Verify each item visually and functionally:

1. **Apple icon** — visible on left, click opens Launchpad
2. **Spaces** — shows active space with accent color, inactive spaces with app icons, empty spaces hidden
3. **Front app** — shows current app name and icon, updates on app switch with animation
4. **Playing** — hidden when no media, shows music icon when playing (test with Spotify/Music)
5. **Calendar** — shows date, time, and weather on right side, click opens Calendar
6. **Volume** — shows volume icon and percentage, updates on volume change
7. **Battery** — shows charge level with correct icon/color
8. **Wifi** — shows connected/disconnected icon
9. **CPU** — graph animating, percentage label updating, click opens btop in Ghostty
10. **Connectivity bracket** — volume/battery/wifi grouped in pill background

- [ ] **Step 5: If any item fails, check logs**

```bash
log show --predicate 'process == "sketchybar"' --last 1m --style compact
```

Fix issues and restart. The old config is one `git checkout` away if needed.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A sketchybar/.config/sketchybar/
git commit -m "fix: post-migration adjustments for SbarLua"
```
