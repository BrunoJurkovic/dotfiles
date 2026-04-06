#!/bin/bash

sketchybar --add item bluetooth right \
  --set bluetooth \
    update_freq=30 \
    icon=􀫥 \
    script="$PLUGIN_DIR/bluetooth.sh" \
    click_script="open x-apple.systempreferences:com.apple.preferences.Bluetooth"
