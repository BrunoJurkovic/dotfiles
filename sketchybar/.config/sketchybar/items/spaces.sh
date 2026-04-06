#!/bin/bash

source "$CONFIG_DIR/colors.sh"

if [ "$1" = "init" ]; then
  sketchybar --remove '/space\..*/' 2>/dev/null

  # Add yabai events
  sketchybar --add event space_change
  sketchybar --add event window_focus
  sketchybar --add event windows_on_spaces

  for sid in 1 2 3 4 5; do
    sketchybar --add item space.$sid left \
      --set space.$sid \
        icon="$sid" \
        icon.font="$NERD_FONT_MONO:Bold:13.0" \
        icon.color=$SPACE_INACTIVE_FG \
        icon.padding_left=9 \
        icon.padding_right=4 \
        label.font="sketchybar-app-font:Regular:14.0" \
        label.color=$SPACE_INACTIVE_FG \
        label.padding_left=0 \
        label.padding_right=9 \
        label.y_offset=-1 \
        background.color=$TRANSPARENT \
        background.corner_radius=10 \
        background.height=26 \
        background.drawing=off \
        click_script="yabai -m space --focus $sid" \
      --subscribe space.$sid space_change window_focus windows_on_spaces
  done

  sketchybar --add item space_updater left \
    --set space_updater \
      drawing=off \
      script="$CONFIG_DIR/plugins/space_update.sh" \
    --subscribe space_updater space_change window_focus windows_on_spaces front_app_switched

  CONFIG_DIR="$CONFIG_DIR" "$CONFIG_DIR/plugins/space_update.sh"
fi
