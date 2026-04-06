#!/usr/bin/env bash

DISPLAY_COUNT=$(yabai -m query --displays | jq 'length')

if [ "$DISPLAY_COUNT" -eq 1 ]; then
  # Laptop only — tighter padding
  yabai -m config top_padding    10
  yabai -m config bottom_padding 10
  yabai -m config left_padding   10
  yabai -m config right_padding  10
  yabai -m config window_gap     10
  yabai -m config external_bar   main:30:0
else
  # Docked — more room, larger gaps
  yabai -m config top_padding    15
  yabai -m config bottom_padding 15
  yabai -m config left_padding   15
  yabai -m config right_padding  15
  yabai -m config window_gap     15
  yabai -m config external_bar   main:30:0
fi

# Always re-apply space 1 overrides
yabai -m config --space 1 top_padding    15
yabai -m config --space 1 bottom_padding 5
yabai -m config --space 1 left_padding   5
yabai -m config --space 1 right_padding  5
yabai -m config --space 1 window_gap     5
