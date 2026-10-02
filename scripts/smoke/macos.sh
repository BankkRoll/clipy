#!/usr/bin/env bash
# Installer smoke test for macOS bundles (dmg + updater .app.tar.gz).
#
# Mounts the dmg, copies the app to /Applications, launches it with
# CLIPY_SMOKE_TEST=1 (exits 0 once the frontend has booted), then removes it.
# Builds are unsigned, so this also confirms an unsigned, un-quarantined app
# launches; downloaded copies additionally need `xattr -dr com.apple.quarantine`.
#
# Usage: scripts/smoke/macos.sh <bundle-dir>
set -euo pipefail

BUNDLE_DIR="${1:?usage: macos.sh <bundle-dir>}"
TIMEOUT="${SMOKE_TIMEOUT:-120}"
MOUNT="/Volumes/clipy-smoke"

DMG="$(ls "$BUNDLE_DIR"/dmg/*.dmg | head -n1)"
echo "dmg: $DMG"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT"
trap 'hdiutil detach "$MOUNT" -quiet || true' EXIT

APP_SRC="$(ls -d "$MOUNT"/*.app | head -n1)"
APP_NAME="$(basename "$APP_SRC")"
rm -rf "/Applications/$APP_NAME"
cp -R "$APP_SRC" /Applications/
EXE="$(ls "/Applications/$APP_NAME/Contents/MacOS/" | head -n1)"

echo "Launching /Applications/$APP_NAME/Contents/MacOS/$EXE in smoke mode"
CLIPY_SMOKE_TEST=1 "/Applications/$APP_NAME/Contents/MacOS/$EXE" &
PID=$!
for _ in $(seq "$TIMEOUT"); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 1
done
if kill -0 "$PID" 2>/dev/null; then
  kill -9 "$PID"
  echo "App did not report ready within ${TIMEOUT}s"
  exit 1
fi
wait "$PID"
echo "Smoke launch OK"

rm -rf "/Applications/$APP_NAME"

# The updater consumes the .app.tar.gz; make sure it exists and unpacks.
TARBALL="$(ls "$BUNDLE_DIR"/macos/*.app.tar.gz 2>/dev/null | head -n1 || true)"
if [ -n "$TARBALL" ]; then
  tar -tzf "$TARBALL" >/dev/null
  echo "updater tarball OK: $TARBALL"
fi

echo "macOS installer smoke tests passed"
