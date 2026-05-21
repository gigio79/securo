#!/usr/bin/env bash
# Wipes and reseeds the demo database. Intended for an hourly cron on
# the public demo host (kimi.usesecuro.com). Safe to run while the app
# is up — seed_perf.py drops + recreates the seed user's data inside a
# transaction.
#
# Usage (host, with the stack running via docker compose):
#   ./reset_demo.sh
#
# Cron line example (hourly, top of the hour):
#   0 * * * * /path/to/securo/reset_demo.sh >> /var/log/securo-demo-reset.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"

DEMO_EMAIL="${DEMO_EMAIL:-demo@securo.app}"
DEMO_PASSWORD="${DEMO_PASSWORD:-DemoSecuro1!}"
DEMO_MONTHS="${DEMO_MONTHS:-6}"

docker compose exec -T backend python scripts/seed_demo.py \
  --email "$DEMO_EMAIL" \
  --password "$DEMO_PASSWORD" \
  --months "$DEMO_MONTHS"

# Clear user-uploaded attachments so disk doesn't grow between resets.
docker compose exec -T backend sh -c 'rm -rf /app/data/attachments/* || true'
