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
