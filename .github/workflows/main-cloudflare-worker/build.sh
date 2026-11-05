#!/usr/bin/env bash
set -euo pipefail
cat > cloudflare-worker/cloudflare-worker-build.json <<'JSON'
{
  "name": "credential-free-package-build",
  "main": "src/index.mts",
  "compatibility_date": "2026-02-11",
  "compatibility_flags": ["nodejs_compat"],
  "upload_source_maps": true
}
JSON
output_dir="$RUNNER_TEMP/cloudflare-worker"
mkdir -p "$output_dir"
pnpm --dir cloudflare-worker exec wrangler deploy \
  --config cloudflare-worker-build.json \
  --dry-run --outdir "$output_dir"
test -f "$output_dir/index.js"
if find "$output_dir" -type l -print -quit | grep -q .; then
  echo '::error::Cloudflare Worker bundle contains a symbolic link'
  exit 1
fi
if find "$output_dir" ! -type f ! -type d -print -quit | grep -q .; then
  echo '::error::Cloudflare Worker bundle contains a non-regular entry'
  exit 1
fi
mkdir -p delivery
mv "$output_dir" delivery/cloudflare-worker
