#!/bin/bash

sketchybar --add item datetime right \
  --set datetime \
    update_freq=30 \
    icon.drawing=off \
    label.font="$NERD_FONT:Medium:12.0" \
    background.color=$BRACKET_COLOR \
    background.corner_radius=12 \
    background.height=28 \
    background.drawing=on \
    icon.padding_left=0 \
    label.padding_left=10 \
    label.padding_right=10 \
    script="$PLUGIN_DIR/datetime.sh" \
    click_script="open -a Calendar"
