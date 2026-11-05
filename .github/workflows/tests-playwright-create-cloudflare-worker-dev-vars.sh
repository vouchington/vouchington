#!/usr/bin/env bash
CF_WORKER_SECRET=$(openssl rand -hex 32)
{
  echo "BACKEND_ORIGIN=http://localhost:$PORT"
  echo "WEB_ORIGIN=http://localhost:$NEXT_PORT"
  echo 'CSP_BROWSER_UPLOAD_ORIGINS=["https://test-images.s3.us-west-2.amazonaws.com","https://test-images.s3.dualstack.us-west-2.amazonaws.com"]'
  echo "CF_WORKER_SECRET=$CF_WORKER_SECRET"
  echo "CACHE_PLACEHOLDER_NONCE=$(openssl rand -hex 32)"
} > cloudflare-worker/.dev.vars
echo "CF_WORKER_SECRET=$CF_WORKER_SECRET" >> "$GITHUB_ENV"
