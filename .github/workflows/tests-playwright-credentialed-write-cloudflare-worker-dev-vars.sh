#!/usr/bin/env bash
CF_WORKER_SECRET=$(openssl rand -hex 32)
CACHE_PLACEHOLDER_NONCE=$(openssl rand -hex 32)
CSP_BROWSER_UPLOAD_ORIGINS="$(jq --compact-output --null-input \
  --arg images_bucket "$S3_BUCKET_IMAGES" \
  --arg uploads_bucket "$S3_BUCKET_IMAGE_UPLOADS" \
  '[
    "https://\($images_bucket).s3.us-west-2.amazonaws.com",
    "https://\($images_bucket).s3.dualstack.us-west-2.amazonaws.com",
    "https://\($uploads_bucket).s3.us-west-2.amazonaws.com",
    "https://\($uploads_bucket).s3.dualstack.us-west-2.amazonaws.com"
  ]')"
cat > cloudflare-worker/.dev.vars << EOF
BACKEND_ORIGIN=http://localhost:$PORT
WEB_ORIGIN=http://localhost:$NEXT_PORT
CSP_BROWSER_UPLOAD_ORIGINS=$CSP_BROWSER_UPLOAD_ORIGINS
CF_WORKER_SECRET=$CF_WORKER_SECRET
CACHE_PLACEHOLDER_NONCE=$CACHE_PLACEHOLDER_NONCE
EOF
echo "CF_WORKER_SECRET=$CF_WORKER_SECRET" >> "$GITHUB_ENV"
