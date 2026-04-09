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
