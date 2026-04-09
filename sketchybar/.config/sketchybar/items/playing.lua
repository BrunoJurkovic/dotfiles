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
