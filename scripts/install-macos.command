#!/bin/bash
set -e

APP_PATH="/Applications/TRH Desktop.app"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: 'TRH Desktop.app' not found in /Applications."
  echo "Please drag TRH Desktop.app to your Applications folder first, then run this script."
  read -p "Press Enter to exit..."
  exit 1
fi

echo "Removing macOS quarantine attribute..."
xattr -cr "$APP_PATH"

echo "Done! Launching TRH Desktop..."
open "$APP_PATH"
