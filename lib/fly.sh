#!/usr/bin/env bash
# SLOW-XV Fly.io deployment helper.
set -euo pipefail

if [[ ! -f fly.toml || ! -f Dockerfile || ! -f package.json ]]; then
  echo "Run this script from the SLOW-XV project root." >&2
  exit 1
fi
command -v fly >/dev/null || { echo "Install flyctl first: https://fly.io/docs/flyctl/install/"; exit 1; }

read -r -p "Fly app name [slow-xv]: " APP_NAME
APP_NAME=${APP_NAME:-slow-xv}
read -r -p "Fly region [iad]: " REGION
REGION=${REGION:-iad}
read -r -p "Owner number [224669288332]: " OWNER_NUMBER
OWNER_NUMBER=${OWNER_NUMBER:-224669288332}

sed -i "s/^app = .*/app = \"${APP_NAME}\"/" fly.toml
sed -i "s/^primary_region = .*/primary_region = \"${REGION}\"/" fly.toml

fly launch --no-deploy --copy-config --name "$APP_NAME" --region "$REGION" --yes 2>/dev/null || true
fly secrets set \
  OWNER_NUMBER="$OWNER_NUMBER" \
  DEVELOPER_NAME="VArnox Tech" \
  BOT_NAME="SLOW-XV" \
  TIMEZONE="Africa/Conakry" \
  SESSIONS_DIR="sessions" \
  NEWSLETTER_JID="120363424782348922@newsletter" \
  --app "$APP_NAME"
fly deploy --app "$APP_NAME" --config fly.toml
echo "SLOW-XV deployed: fly status --app $APP_NAME"