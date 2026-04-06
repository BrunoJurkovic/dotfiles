#!/bin/bash

sketchybar --add graph cpu right 30 \
  --set cpu \
    update_freq=5 \
    graph.color=$HIGHLIGHT_COLOR \
    graph.fill_color=0x338aadf4 \
    graph.line_width=1.5 \
    icon=􀧓 \
    icon.color=$ITEM_COLOR \
    icon.font="SF Pro:Semibold:12.0" \
    icon.padding_left=14 \
    icon.padding_right=4 \
    label.font="$NERD_FONT_MONO:Regular:11.0" \
    label.color=$ITEM_COLOR \
    label.padding_left=4 \
    label.padding_right=14 \
    width=90 \
    padding_left=0 \
    padding_right=0 \
    background.color=$BRACKET_COLOR \
    background.corner_radius=12 \
    background.height=28 \
    background.drawing=on \
    script="$PLUGIN_DIR/cpu.sh" \
    click_script="open -na /Applications/Ghostty.app --args -e btop"
