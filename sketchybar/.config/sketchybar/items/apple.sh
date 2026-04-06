#!/bin/bash

APPLE=$'\xef\x85\xb9'  # U+F179 nf-fa-apple

sketchybar --add item apple left \
  --set apple \
    icon="$APPLE" \
    icon.font="$NERD_FONT_MONO:Bold:16.0" \
    icon.color=$HIGHLIGHT_COLOR \
    icon.padding_left=8 \
    icon.padding_right=6 \
    label.drawing=off \
    click_script="open -a Launchpad"
