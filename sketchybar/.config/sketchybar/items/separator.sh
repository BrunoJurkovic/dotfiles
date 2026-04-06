#!/bin/bash

# Creates a visual separator/divider
# Usage: source separator.sh <name> <position>
# Example: source separator.sh sep1 right

SEP_NAME="${1:-separator}"
SEP_POS="${2:-right}"

sketchybar --add item "$SEP_NAME" "$SEP_POS" \
  --set "$SEP_NAME" \
    icon="│" \
    icon.color=$MUTED_COLOR \
    icon.font="SF Pro:Light:14.0" \
    icon.padding_left=4 \
    icon.padding_right=4 \
    label.drawing=off \
    background.drawing=off
