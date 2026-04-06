#!/usr/bin/env sh

# Maps the focused space to its accent color and updates JankyBorders.
# Called by yabai signal on space_changed.

SPACE_INDEX=$(yabai -m query --spaces --space | jq '.index')

case "$SPACE_INDEX" in
  1) COLOR="0xff8aadf4" ;;  # blue   (terminal)
  2) COLOR="0xffa6da95" ;;  # green  (browser)
  3) COLOR="0xffc6a0f6" ;;  # mauve  (social)
  4) COLOR="0xfff5bde6" ;;  # pink   (design)
  5) COLOR="0xff8bd5ca" ;;  # teal   (misc)
  *) COLOR="0xff8aadf4" ;;  # fallback blue
esac

borders active_color="glow($COLOR)"
