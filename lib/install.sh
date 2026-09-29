#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash lib/install.sh" >&2
  exit 1
fi

apt-get update -qq
apt-get install -y curl ffmpeg imagemagick webp build-essential
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

PROJECT_DIR=${PROJECT_DIR:-/opt/slow-xv}
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  echo "Set PROJECT_DIR to a checked-out SLOW-XV project before running this installer." >&2
  exit 1
fi
cd "$PROJECT_DIR"
npm ci
[[ -f .env ]] || cp sample.env .env
npm run reset-data

if ! command -v pm2 >/dev/null; then npm install -g pm2; fi
pm2 start index.js --name slow-xv
pm2 save
echo "SLOW-XV installed at $PROJECT_DIR."
echo "Edit $PROJECT_DIR/.env, then use: pm2 restart slow-xv"