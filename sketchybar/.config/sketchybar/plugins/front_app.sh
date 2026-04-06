#!/bin/bash

# Updates the front app display when the focused app changes
# Space updates are handled by space_update.sh via the front_app_switched subscription

if [ "$SENDER" = "front_app_switched" ]; then
  sketchybar --set "$NAME" \
    label="$INFO" \
    icon="$($CONFIG_DIR/plugins/icons.sh "$INFO")"
fi
