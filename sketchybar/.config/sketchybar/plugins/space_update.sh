#!/bin/bash

# Kill any previous instance to prevent race conditions on rapid switching
PIDFILE="/tmp/sketchybar_space_update.pid"
if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null
fi
echo $$ > "$PIDFILE"

CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/sketchybar}"
source "$CONFIG_DIR/colors.sh"

FOCUSED=$(yabai -m query --spaces --space 2>/dev/null | jq -r '.index')

if [ -z "$FOCUSED" ] || [ "$FOCUSED" = "null" ]; then
  rm -f "$PIDFILE"
  exit 0
fi

# Per-space accent colors
COLORS=("" "$SPACE_1_COLOR" "$SPACE_2_COLOR" "$SPACE_3_COLOR" "$SPACE_4_COLOR" "$SPACE_5_COLOR")

# Query all windows once instead of per-space
ALL_WINDOWS=$(yabai -m query --windows 2>/dev/null)

# Build a single batched sketchybar command
ARGS=()

for sid in 1 2 3 4 5; do
  COLOR="${COLORS[$sid]}"

  apps=$(echo "$ALL_WINDOWS" | jq -r ".[] | select(.space == $sid) | .app" | sort -u)

  icon_strip=""
  if [ -n "$apps" ]; then
    while IFS= read -r app; do
      if [ -n "$app" ]; then
        icon_strip+=" $($CONFIG_DIR/plugins/icons.sh "$app")"
      fi
    done <<< "$apps"
  fi

  if [ "$sid" = "$FOCUSED" ]; then
    ARGS+=(--set space.$sid \
      icon.color=0xff1e1e2e \
      label.color=0xff1e1e2e \
      label="$icon_strip" \
      background.drawing=on \
      background.color="$COLOR" \
      drawing=on)
  elif [ -n "$apps" ]; then
    ARGS+=(--set space.$sid \
      icon.color="$COLOR" \
      label.color=$SPACE_INACTIVE_FG \
      label="$icon_strip" \
      background.drawing=off \
      drawing=on)
  else
    ARGS+=(--set space.$sid drawing=off)
  fi
done

# Single atomic update — no partial state visible
sketchybar "${ARGS[@]}"

rm -f "$PIDFILE"
