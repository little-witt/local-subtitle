#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT/dist"
PACKAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$PACKAGE_DIR"' EXIT

VERSION="$(
  python3 - "$ROOT/manifest.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as file:
    print(json.load(file)["version"])
PY
)"

ZIP_NAME="france-tv-local-subtitle-translator-${VERSION}.zip"
TARGET="$DIST_DIR/$ZIP_NAME"

mkdir -p "$DIST_DIR" "$PACKAGE_DIR/package"

runtime_files=(
  "manifest.json"
  "background.js"
  "content.js"
  "popup.html"
  "popup.js"
  "popup.css"
)

for file in "${runtime_files[@]}"; do
  cp "$ROOT/$file" "$PACKAGE_DIR/package/$file"
done

cp -R "$ROOT/icons" "$PACKAGE_DIR/package/icons"

rm -f "$TARGET"
(
  cd "$PACKAGE_DIR/package"
  zip -qr "$TARGET" .
)

echo "$TARGET"
