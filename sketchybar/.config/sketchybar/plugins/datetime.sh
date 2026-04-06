#!/bin/bash

CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/sketchybar}"

# Date and time
DATETIME=$(date +'%a %d %b · %I:%M %p')

# Weather (cached, refreshed every 30 min)
CACHE_DIR="$HOME/.cache/sketchybar"
CACHE="$CACHE_DIR/weather.txt"
mkdir -p "$CACHE_DIR"

if [ ! -f "$CACHE" ] || [ $(( $(date +%s) - $(stat -f %m "$CACHE" 2>/dev/null || echo 0) )) -gt 1800 ]; then
  WEATHER=$(curl -s "wttr.in/?format=%c%t" 2>/dev/null | head -1 | sed 's/+//')
  if [ -n "$WEATHER" ] && [[ "$WEATHER" != *"Unknown"* ]] && [[ "$WEATHER" != *"curl"* ]]; then
    echo "$WEATHER" > "$CACHE"
  fi
fi

WEATHER=$(cat "$CACHE" 2>/dev/null || echo "")

if [ -n "$WEATHER" ]; then
  sketchybar --set "$NAME" label="$DATETIME · $WEATHER"
else
  sketchybar --set "$NAME" label="$DATETIME"
fi
