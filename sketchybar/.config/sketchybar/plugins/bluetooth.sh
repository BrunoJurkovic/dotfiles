#!/bin/bash

CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/sketchybar}"
source "$CONFIG_DIR/colors.sh"

# Check if Bluetooth is on
BT_STATUS=$(defaults read /Library/Preferences/com.apple.Bluetooth ControllerPowerState 2>/dev/null)

if [ "$BT_STATUS" = "1" ]; then
  # Bluetooth is on - check for connected devices
  CONNECTED=$(system_profiler SPBluetoothDataType 2>/dev/null | grep -A 20 "Connected:" | grep -c "Yes" || echo "0")

  if [ "$CONNECTED" -gt 0 ]; then
    ICON="􀪿"
    LABEL="$CONNECTED"
    COLOR=$HIGHLIGHT_COLOR
  else
    ICON="􀫥"
    LABEL=""
    COLOR=$MUTED_COLOR
  fi
else
  ICON="􀫏"
  LABEL="Off"
  COLOR=$MUTED_COLOR
fi

sketchybar --set "$NAME" icon="$ICON" label="$LABEL" icon.color="$COLOR"
