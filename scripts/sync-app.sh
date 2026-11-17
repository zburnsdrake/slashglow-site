#!/bin/sh
# Copies the planner's shared files into the /Glow app (one source: this repo).
# Usage: scripts/sync-app.sh ../glow-lights
set -e
APP="${1:-../glow-lights}/app/src/main/assets"
cp catalog.json planner.json "$APP/"
echo "copied catalog.json and planner.json to $APP"
