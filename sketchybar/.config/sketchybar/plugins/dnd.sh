#!/bin/bash

CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/sketchybar}"
source "$CONFIG_DIR/colors.sh"

# Check Focus/DND status using the focus state
# This checks if any Focus mode is currently active
FOCUS_STATE=$(plutil -extract data.0.storeAssertionRecords.0.assertionDetails.assertionDetailsModeIdentifier raw -o - ~/Library/DoNotDisturb/DB/Assertions.json 2>/dev/null)

if [ -n "$FOCUS_STATE" ] && [ "$FOCUS_STATE" != "" ]; then
  # Focus mode is active
  ICON="􀆺"
  COLOR=$WARNING_COLOR
  sketchybar --set "$NAME" icon="$ICON" icon.color="$COLOR" drawing=on
else
  # No focus mode - hide the indicator
  sketchybar --set "$NAME" drawing=off
fi
