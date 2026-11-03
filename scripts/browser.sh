#!/bin/sh
# (Re)start the test browser with the unpacked extension. usage: scripts/browser.sh <profile-dir>
PROFILE="$1"
pkill -f "user-data-dir=$PROFILE" ; sleep 2
CHROME="$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google\ Chrome\ for\ Testing.app | tail -1)/Contents/MacOS/Google Chrome for Testing"
EXT="$(cd "$(dirname "$0")/.." && pwd)"
"$CHROME" --user-data-dir="$PROFILE" --no-first-run --remote-debugging-port=9333 --load-extension="$EXT" --disable-extensions-except="$EXT" about:blank >/dev/null 2>&1 &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s localhost:9333/json/version >/dev/null && exit 0; sleep 1; done
echo "browser did not start" >&2; exit 1
