#!/bin/bash

sketchybar --add item memory right \
  --set memory update_freq=15 \
  icon=􀧖 \
  script="$PLUGIN_DIR/memory.sh" \
  click_script="open -a 'Activity Monitor'"
