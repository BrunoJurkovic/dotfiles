#!/bin/bash

CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/sketchybar}"
source "$CONFIG_DIR/colors.sh"

# Fetch weather using wttr.in (auto-detects location via IP)
# Format: condition icon + temperature
WEATHER=$(curl -s "wttr.in/?format=%c%t" 2>/dev/null | head -1 | sed 's/+//')

if [ -z "$WEATHER" ] || [[ "$WEATHER" == *"Unknown"* ]] || [[ "$WEATHER" == *"curl"* ]]; then
  sketchybar --set "$NAME" label="--" icon="􀇔"
  exit 0
fi

sketchybar --set "$NAME" label="$WEATHER" icon=""
