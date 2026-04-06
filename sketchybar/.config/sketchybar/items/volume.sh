#!/bin/bash

sketchybar --add item volume right \
  --set volume \
    icon.padding_left=10 \
    label.font="$NERD_FONT_MONO:Regular:11.0" \
    padding_right=2 \
    script="$PLUGIN_DIR/volume.sh" \
    click_script="open x-apple.systempreferences:com.apple.preference.sound" \
  --subscribe volume volume_change
