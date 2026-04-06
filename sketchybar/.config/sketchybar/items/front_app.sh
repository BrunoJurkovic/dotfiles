#!/bin/bash

sketchybar --add item front_app left \
  --set front_app \
    icon.font="sketchybar-app-font:Regular:14.0" \
    label.font="$NERD_FONT:Medium:12.0" \
    icon.color=$ITEM_COLOR \
    label.color=$ITEM_COLOR \
    background.color=$ACCENT_COLOR \
    background.corner_radius=10 \
    background.height=24 \
    background.drawing=on \
    script="$PLUGIN_DIR/front_app.sh" \
    click_script="open -a 'Mission Control'" \
  --subscribe front_app front_app_switched
