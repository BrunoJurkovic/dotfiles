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
