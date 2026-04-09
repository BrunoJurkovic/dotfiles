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
