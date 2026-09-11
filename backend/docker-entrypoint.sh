#!/usr/bin/env bash
set -euo pipefail

node data-stores/psql/migrate.mts
node scripts/seeds/playwright-test-data.mts

exec node entrypoints/api/serve.mts
