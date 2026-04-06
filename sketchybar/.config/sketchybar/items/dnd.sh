#!/bin/bash

sketchybar --add item dnd right \
  --set dnd \
    update_freq=10 \
    icon=􀆺 \
    label="" \
    icon.color=$WARNING_COLOR \
    background.drawing=off \
    script="$PLUGIN_DIR/dnd.sh" \
    click_script="open x-apple.systempreferences:com.apple.Focus"
