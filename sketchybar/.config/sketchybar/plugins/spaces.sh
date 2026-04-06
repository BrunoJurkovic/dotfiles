#!/bin/bash

source "$CONFIG_DIR/colors.sh"

update_workspace_appearance() {
  local sid=$1
  local is_focused=$2

  if [ "$is_focused" = "true" ]; then
    sketchybar --set space.$sid background.drawing=on \
      background.color=$ACCENT_COLOR \
      label.color=$ITEM_COLOR \
      icon.color=$ITEM_COLOR
  else
    sketchybar --set space.$sid background.drawing=off \
      label.color=$ACCENT_COLOR \
      icon.color=$ACCENT_COLOR
  fi
}

update_icons() {
  local sid=$1

  apps=$(yabai -m query --windows --space "$sid" 2>/dev/null | \
    jq -r '.[].app' | sort -u)

  icon_strip=""
  if [ -n "$apps" ]; then
    while read -r app; do
      icon_strip+=" $($CONFIG_DIR/plugins/icons.sh "$app")"
    done <<< "$apps"
  else
    icon_strip=" —"
  fi

  sketchybar --animate sin 10 --set space.$sid label="$icon_strip"
}

FOCUSED=$(yabai -m query --spaces --space 2>/dev/null | jq -r '.index')

for sid in 1 2 3 4 5; do
  if [ "$sid" = "$FOCUSED" ]; then
    update_workspace_appearance "$sid" "true"
  else
    update_workspace_appearance "$sid" "false"
  fi

  update_icons "$sid"

  # Hide empty unfocused spaces
  app_count=$(yabai -m query --windows --space "$sid" 2>/dev/null | jq 'length')
  if [ "$sid" != "$FOCUSED" ] && [ "${app_count:-0}" -eq 0 ]; then
    sketchybar --set space.$sid display=0
  fi
done
