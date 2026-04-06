#!/bin/bash

CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/sketchybar}"
source "$CONFIG_DIR/colors.sh"

# Get disk usage percentage for root volume
PERCENTAGE=$(df -H / | tail -1 | awk '{print $5}' | tr -d '%')
USED=$(df -H / | tail -1 | awk '{print $3}')
TOTAL=$(df -H / | tail -1 | awk '{print $2}')

# Color based on usage
if [ "$PERCENTAGE" -ge 90 ]; then
  COLOR=$DANGER_COLOR
  ICON="􀨪"
elif [ "$PERCENTAGE" -ge 75 ]; then
  COLOR=$WARNING_COLOR
  ICON="􀨪"
else
  COLOR=$ITEM_COLOR
  ICON="􀨨"
fi

sketchybar --set "$NAME" icon="$ICON" label="${USED}/${TOTAL}" icon.color="$COLOR"
