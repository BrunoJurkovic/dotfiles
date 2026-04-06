#!/bin/bash

source "$CONFIG_DIR/colors.sh"

PERCENTAGE=$(pmset -g batt | grep -Eo "\d+%" | cut -d% -f1)
CHARGING=$(pmset -g batt | grep 'AC Power')

if [ -z "$PERCENTAGE" ]; then
  exit 0
fi

case ${PERCENTAGE} in
  9[0-9]|100)
    ICON="􀛨"
    COLOR=$SUCCESS_COLOR
    ;;
  [5-8][0-9])
    ICON="􀺸"
    COLOR=$ITEM_COLOR
    ;;
  [3-4][0-9])
    ICON="􀺶"
    COLOR=$ITEM_COLOR
    ;;
  [1-2][0-9])
    ICON="􀛩"
    COLOR=$WARNING_COLOR
    ;;
  *)
    ICON="􀛪"
    COLOR=$DANGER_COLOR
    ;;
esac

if [ -n "$CHARGING" ]; then
  ICON="􀢋"
  COLOR=$SUCCESS_COLOR
fi

sketchybar --set "$NAME" icon="$ICON" label="${PERCENTAGE}%" icon.color="$COLOR"
