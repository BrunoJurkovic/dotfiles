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
