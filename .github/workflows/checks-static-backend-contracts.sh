#!/usr/bin/env bash

pnpm run backend-row-contracts:check
pnpm run api-fixtures:check
export NODE_ENV=test
export S3_BUCKET_IMAGES=test-images
export S3_BUCKET_IMAGE_UPLOADS=test-image-uploads
export S3_BUCKET_SITEMAPS=test-sitemaps
export S3_BUCKET_RENDERS=test-renders
export S3_BUCKET_ASSETS=test-assets
export S3_BUCKET_CRAWLS=test-crawls
export S3_BUCKET_USER_EXPORTS=test-user-exports
export S3_BUCKET_QUARANTINE=test-quarantine
node ci/check-live-mcp-catalog.mjs
node ci/check-topic-merge-foreign-keys.mts
node ci/validate-generated-ddl-inserts.mts
node ci/check-scheduled-job-schedules.mts
node ci/check-seed-topic-csvs.mts
pnpm run mcp:catalog -- --check
