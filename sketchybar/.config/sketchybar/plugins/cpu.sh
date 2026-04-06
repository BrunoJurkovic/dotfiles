#!/bin/bash

CPU_PERCENT=$(ps -eo pcpu | awk -v cores=$(sysctl -n machdep.cpu.thread_count) '{sum+=$1} END {printf "%.0f", sum/cores}')
NORMALIZED=$(echo "$CPU_PERCENT" | awk '{printf "%.2f", $1/100}')

sketchybar --set $NAME label="${CPU_PERCENT}%" \
           --push $NAME $NORMALIZED
