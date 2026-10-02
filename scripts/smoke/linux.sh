#!/usr/bin/env bash
# Installer smoke test for Linux bundles (deb + AppImage; rpm is inspected only,
# since the runner is Debian-based).
#
# Each bundle is launched with CLIPY_SMOKE_TEST=1 under a virtual display; the
# app exits 0 once the frontend has booted and reported ready.
#
# Usage: scripts/smoke/linux.sh <bundle-dir>
set -euo pipefail

BUNDLE_DIR="${1:?usage: linux.sh <bundle-dir>}"
TIMEOUT="${SMOKE_TIMEOUT:-120}"

smoke_launch() {
  echo "Launching $* in smoke mode"
  CLIPY_SMOKE_TEST=1 timeout "$TIMEOUT" xvfb-run -a "$@"
  echo "Smoke launch OK"
}

# --- deb ---------------------------------------------------------------------
DEB="$(ls "$BUNDLE_DIR"/deb/*.deb | head -n1)"
echo "deb: $DEB"
sudo apt-get install -y "$DEB"
BIN="$(dpkg -L clipy | grep -E '^/usr/bin/' | head -n1)"
test -x "$BIN" || { echo "binary missing after install"; exit 1; }
dpkg -L clipy | grep -q '\.desktop$' || { echo "desktop entry missing"; exit 1; }
smoke_launch "$BIN"
sudo apt-get remove -y clipy
test ! -e "$BIN" || { echo "binary still present after removal"; exit 1; }

# --- AppImage ----------------------------------------------------------------
APPIMAGE="$(ls "$BUNDLE_DIR"/appimage/*.AppImage | head -n1)"
echo "AppImage: $APPIMAGE"
chmod +x "$APPIMAGE"
# NOTE: GitHub runners lack FUSE; extract-and-run avoids needing it.
APPIMAGE_EXTRACT_AND_RUN=1 smoke_launch "$APPIMAGE"

# --- rpm (metadata only) -----------------------------------------------------
RPM="$(ls "$BUNDLE_DIR"/rpm/*.rpm | head -n1)"
echo "rpm: $RPM"
rpm -qip "$RPM"
rpm -qlp "$RPM" | grep -q '^/usr/bin/' || { echo "rpm has no binary"; exit 1; }

echo "Linux installer smoke tests passed"
