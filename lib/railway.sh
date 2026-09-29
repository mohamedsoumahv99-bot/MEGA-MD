#!/usr/bin/env bash
# SLOW-XV Railway deployment helper.
set -euo pipefail

if [[ ! -f package.json || ! -f Dockerfile ]]; then
  echo "Run this script from the SLOW-XV project root." >&2
  exit 1
fi
command -v railway >/dev/null || { echo "Install Railway CLI first: https://docs.railway.com/guides/cli"; exit 1; }

read -r -p "Railway service name [slow-xv]: " SERVICE_NAME
SERVICE_NAME=${SERVICE_NAME:-slow-xv}
read -r -p "Owner number [224669288332]: " OWNER_NUMBER
OWNER_NUMBER=${OWNER_NUMBER:-224669288332}

railway init --name "$SERVICE_NAME" 2>/dev/null || true
railway variables set \
  OWNER_NUMBER="$OWNER_NUMBER" \
  DEVELOPER_NAME="VArnox Tech" \
  BOT_NAME="SLOW-XV" \
  TIMEZONE="Africa/Conakry" \
  SESSIONS_DIR="sessions" \
  NEWSLETTER_JID="120363424782348922@newsletter"
railway up --detach
echo "SLOW-XV deployed. Inspect it with: railway status"