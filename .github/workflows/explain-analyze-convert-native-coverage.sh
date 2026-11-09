#!/usr/bin/env bash
pnpm exec coverage-check native-v8-to-lcov \
--v8-dir backend/scripts/explain-analyze/output/pruning-v8 \
--source-root "$GITHUB_WORKSPACE" \
--output backend/scripts/explain-analyze/output/retirement-coverage/lcov.info \
--include 'backend/data-stores/psql/migration-runner/before-retire-monthly-partition.mts' \
--include 'backend/data-stores/psql/migrate.mts' \
--include 'backend/services/data-retention/cleanup-text-embeddings.mts' \
--include 'backend/data-stores/psql/explain-analyze.mts' \
--include 'backend/services/crawls/{dispatch-per-hostname,dispatch-tier-urls}.mts' \
--include 'backend/services/crawler-referral-links/dispatch.mts' \
--include 'backend/services/rss-feeds/{get-to-fetch,crawl-config,update,update-fields,update-state-helpers}.mts' \
--include 'backend/services/referral-link-unfurl/dispatch.mts' \
--include 'backend/services/stories/story-post-related-url-projection-{work,reconcile,dispatch}.mts' \
--include 'backend/services/stories/story-post-related-url-projection.mts' \
--include 'backend/services/openai-moderation/{delete-flagged,quarantine-reconciliation}.mts' \
--include 'backend/workers/openai-moderation/processors/openai-moderation-omni-single.mts' \
--include 'backend/scripts/explain-analyze/run-scenarios/{community-round-trips,conversation-participant-admission,modmail-option-a,modmail-first-reply}.mts' \
--include 'backend/scripts/explain-analyze/pruning/{run,retirement-controls,retirement-fixture,retirement-schema,retirement-transaction,migration-*}.mts' \
--include 'backend/scripts/explain-analyze/pruning/idle-embedding-retention.mts'
