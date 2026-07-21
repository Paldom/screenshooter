#!/usr/bin/env bash
# One-time setup for the screenshooter recorder: pinned npm deps + Chromium + ffmpeg check.
# Exits non-zero with a actionable message on any missing prerequisite.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() { echo "setup: ERROR: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "node not found — install Node.js >= 20 (https://nodejs.org)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "node $(node --version) too old — need >= 20"

command -v ffmpeg >/dev/null 2>&1 || fail "ffmpeg not found on PATH — install it (macOS: brew install ffmpeg; Debian/Ubuntu: apt install ffmpeg; Windows: winget install ffmpeg)"

command -v npm >/dev/null 2>&1 || fail "npm not found (comes with Node.js)"

echo "setup: installing pinned npm dependencies into $HERE ..."
npm install --prefix "$HERE" --no-fund --no-audit --loglevel=error || fail "npm install failed"

echo "setup: ensuring Playwright Chromium is installed ..."
(cd "$HERE" && npx playwright install chromium) || fail "playwright install chromium failed"

echo "setup: OK — record with: node \"$HERE/record.mjs\" <scenario.yaml> --out <dir>"
