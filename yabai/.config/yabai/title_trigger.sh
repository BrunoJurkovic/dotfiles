#!/usr/bin/env bash
# yabai window_title_changed -> sketchybar, at most one trigger per 0.2 s.
#
# A focused Grafana or terminal tab can retitle 60+ times a second. Every
# trigger is a message into sketchybar and on into its Lua config; bursts like
# that can fill both mach queues and deadlock the bar (sketchybar 2.23 sends
# without a timeout). Trailing edge: the first title change arms a timer, the
# rest within 0.2 s are dropped, and the bar then reads the title as it is
# after the burst.
lock="${TMPDIR:-/tmp}/yabai-title-trigger"

if ! mkdir "$lock" 2>/dev/null; then
  # Armed by an earlier change. A lock older than 2 s was left by a killed
  # timer, so take it over instead of dropping titles for good.
  now=$(date +%s)
  [ $((now - $(stat -f %m "$lock" 2>/dev/null || echo "$now"))) -lt 2 ] && exit 0
  touch "$lock"
fi

(
  sleep 0.2
  rmdir "$lock" 2>/dev/null
  sketchybar --trigger yabai_window_title
) >/dev/null 2>&1 &
