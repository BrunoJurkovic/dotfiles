#!/bin/bash

WORKSPACE_ID=$1

if [ -z "$WORKSPACE_ID" ]; then
  echo "No workspace ID provided"
  exit 1
fi

yabai -m space --focus "$WORKSPACE_ID" 2>/dev/null
