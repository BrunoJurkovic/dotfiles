#!/bin/bash

sketchybar --add item calendar right \
  --set calendar icon=􀧞 \
  update_freq=15 \
  script="$PLUGIN_DIR/calendar.sh" \
  click_script="open -a Calendar"
