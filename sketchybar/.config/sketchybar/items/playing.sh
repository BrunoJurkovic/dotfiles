#!/bin/bash

MUSIC=$'\xef\x80\x81'  # U+F001 nf-fa-music

sketchybar --add item playing e \
  --set playing \
    icon="$MUSIC" \
    icon.font="$NERD_FONT_MONO:Regular:12.0" \
    icon.color=$SUCCESS_COLOR \
    icon.padding_left=4 \
    icon.padding_right=4 \
    label.drawing=off \
    drawing=off \
    script="$PLUGIN_DIR/playing.sh" \
  --subscribe playing media_change
