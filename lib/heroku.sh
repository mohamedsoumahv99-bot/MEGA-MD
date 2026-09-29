#!/usr/bin/env bash
# SLOW-XV Heroku deployment helper.
set -euo pipefail

if [[ ! -f app.json || ! -f Dockerfile || ! -f package.json ]]; then
  echo "Run this script from the SLOW-XV project root." >&2
  exit 1
fi
for command_name in git heroku; do
  command -v "$command_name" >/dev/null || { echo "Missing command: $command_name" >&2; exit 1; }
done

read -r -p "Heroku app name [slow-xv-bot]: " APP_NAME
APP_NAME=${APP_NAME:-slow-xv-bot}
read -r -p "Owner number [224669288332]: " OWNER_NUMBER
OWNER_NUMBER=${OWNER_NUMBER:-224669288332}

heroku create "$APP_NAME" 2>/dev/null || true
heroku stack:set container --app "$APP_NAME"
heroku config:set \
  OWNER_NUMBER="$OWNER_NUMBER" \
  DEVELOPER_NAME="VArnox Tech" \
  BOT_NAME="SLOW-XV" \
  TIMEZONE="Africa/Conakry" \
  SESSIONS_DIR="sessions" \
  NEWSLETTER_JID="120363424782348922@newsletter" \
  --app "$APP_NAME"
git remote get-url heroku >/dev/null 2>&1 || heroku git:remote --app "$APP_NAME"
git push heroku HEAD:main
heroku ps:scale web=1 --app "$APP_NAME"
echo "SLOW-XV deployed: https://${APP_NAME}.herokuapp.com"