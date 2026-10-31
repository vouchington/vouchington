#!/usr/bin/env bash
set -euo pipefail

node data-stores/psql/migrate.mts
node test-helpers/playwright-seed-data.mts

exec node entrypoints/api/serve.mts
