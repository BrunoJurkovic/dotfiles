#!/bin/bash

source "$CONFIG_DIR/colors.sh"

CPU_PERCENT=$(ps -eo pcpu | awk -v cores=$(sysctl -n machdep.cpu.thread_count) '{sum+=$1} END {printf "%.0f", sum/cores}')
NORMALIZED=$(echo "$CPU_PERCENT" | awk '{printf "%.2f", $1/100}')

if [ "$CPU_PERCENT" -gt 80 ]; then
  COLOR=$DANGER_COLOR
elif [ "$CPU_PERCENT" -gt 50 ]; then
  COLOR=$WARNING_COLOR
else
  COLOR=$HIGHLIGHT_COLOR
fi

sketchybar --set $NAME label="${CPU_PERCENT}%" \
           graph.color=$COLOR \
           --push $NAME $NORMALIZED
