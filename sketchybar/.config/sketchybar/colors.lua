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
