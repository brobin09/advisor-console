#!/bin/bash
# Double-click this file to build Advisor Console.
# It runs in Terminal automatically. You don't need to type anything.

cd "$(dirname "$0")"

echo ""
echo "==============================================="
echo "  Building Advisor Console"
echo "  NCCU Department of History"
echo "==============================================="
echo ""

# --- check Node ---
if ! command -v npm >/dev/null 2>&1; then
  echo "!! Node.js is not installed."
  echo "   Download it from https://nodejs.org (choose the LTS version),"
  echo "   install it, then double-click this file again."
  echo ""
  read -p "Press Return to close."
  exit 1
fi

echo "Step 1 of 2: Installing components."
echo "   (First time only. Downloads ~200 MB, takes a few minutes.)"
echo ""
npm install --no-audit --no-fund
if [ $? -ne 0 ]; then
  echo ""
  echo "!! Install failed. Copy the red text above and send it to Claude."
  read -p "Press Return to close."
  exit 1
fi

echo ""
echo "Step 2 of 2: Building the app."
echo ""
npm run dist
if [ $? -ne 0 ]; then
  echo ""
  echo "!! Build failed. Copy the red text above and send it to Claude."
  read -p "Press Return to close."
  exit 1
fi

echo ""
echo "==============================================="
echo "  DONE"
echo "==============================================="
echo ""
echo "Opening the dist folder now."
echo ""
echo "NEXT STEPS:"
echo "  1. Go into the 'mac-arm64' (or 'mac') folder."
echo "  2. Drag 'Advisor Console.app' to your Applications folder."
echo "  3. FIRST LAUNCH ONLY: right-click it -> Open -> Open."
echo "     (macOS blocks unsigned apps on a plain double-click, once.)"
echo ""
open dist 2>/dev/null

read -p "Press Return to close this window."
