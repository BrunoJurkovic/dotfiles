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
