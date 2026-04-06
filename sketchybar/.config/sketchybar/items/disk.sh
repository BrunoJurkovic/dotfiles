#!/bin/bash

sketchybar --add item disk right \
  --set disk \
    update_freq=120 \
    icon=􀨨 \
    script="$PLUGIN_DIR/disk.sh" \
    click_script="open /System/Applications/Utilities/Disk\ Utility.app"
