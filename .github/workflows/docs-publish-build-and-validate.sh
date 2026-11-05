#!/usr/bin/env bash
set -euo pipefail
node ci/render-psql-docs.mts delivery/docs/psql
node ci/render-mcp-docs.mts delivery/docs/mcp
for required_path in \
  delivery/docs/mcp/index.html \
  delivery/docs/mcp/mcp.json \
  delivery/docs/psql/index.html \
  delivery/docs/psql/schema.md \
  delivery/docs/psql/schema.json; do
  test -f "$required_path"
done
if find delivery -type l -print -quit | grep -q .; then
  echo '::error::Documentation delivery contains a symbolic link'
  exit 1
fi
if find delivery ! -type f ! -type d -print -quit | grep -q .; then
  echo '::error::Documentation delivery contains a non-regular entry'
  exit 1
fi
