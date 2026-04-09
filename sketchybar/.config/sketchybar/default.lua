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
