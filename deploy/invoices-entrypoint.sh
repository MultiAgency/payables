#!/bin/sh
# Fresh contributor-app volume only. Never import a legacy payout executor's settings or state.
set -eu
umask 077
APP=${APP_DIR:-/app}
DATA=${DATA_DIR:-/data}
for base in "$DATA" "$DATA/state"; do
  for name in .env .env.dao .env.payout .ops .invoices .owner-intents .work-orders; do
    if [ -e "$base/$name" ] || [ -L "$base/$name" ]; then
      echo "Refusing contributor-app startup on legacy agent state. Preserve its executor and use a separate volume." >&2
      exit 1
    fi
  done
done
mkdir -p "$DATA/state"
cd "$DATA/state"
exec "$APP/node_modules/.bin/tsx" "$APP/src/gateway/server.ts"
