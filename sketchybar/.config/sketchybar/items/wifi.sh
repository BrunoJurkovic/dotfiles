#!/bin/bash

sketchybar --add item wifi right \
  --set wifi \
    icon=􀙇 \
    label.drawing=off \
    icon.padding_left=4 \
    icon.padding_right=10 \
    padding_left=2 \
    script="$PLUGIN_DIR/wifi.sh" \
    click_script="open x-apple.systempreferences:com.apple.preference.network" \
  --subscribe wifi wifi_change
