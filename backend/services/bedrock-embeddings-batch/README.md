# Bedrock Embeddings Batch Service

Implements the eventual-consistency batch pipeline for `nova-2-multimodal-embeddings-v1`
embeddings: creation-job assembly (CSV/JSONL file building, entity locking, Bedrock Batch API
submission), poll-driven result processing, and stale-batch cleanup. Split out of
[`@services/bedrock-embeddings`](../bedrock-embeddings/README.md) so that batch-only dependencies
(`pg-copy-streams`, `@aws-sdk/client-bedrock`, `undici`, and the various per-entity content
services) are only pulled in by the batch worker/queue, not by every consumer of the base
single-pipeline lookup/dedup API.

The dispatcher/poll query helpers (`getPendingBatches`, `getBatchInfo`, `getBatchIdByJobArn`, …)
and the `bedrock-embeddings-batch-config` `DynamicConfig` remain in the base package at
`@services/bedrock-embeddings/batch/*` because they are reachable from the
[`bedrock-batch-sqs` worker](../../workers/bedrock-batch-sqs/README.md) and must not pull in
AWS-SDK-only or `pg-copy-streams` transitive dependencies.

## Public Helpers

- `processBatchCreation(...)` / `processImageBatchCreation(...)` (`utils.mts`) — assembles a batch
  file for pending entities, submits it via `createBatch`, and records lock rows.
- `processBatchResultsInBatches` / `processCrawlChunkBatchResults` /
  `processImageBatchResultsInBatches` (`result-processing.mts`) — streams downloaded batch results
  and applies per-entity updates.
- `getBatchCreationLimits` / `getRateLimitConfig` (`rate-limits.mts`) — enforces in-flight job and
  hourly request caps before a new batch is created.
- `deriveBedrockBatchStatus` / `lifecycleColumnForBedrockStatus` (`derive-status.mts`) — maps raw
  Bedrock job status to the internal batch lifecycle.
- `isEntityLockedForBatch` (`locks.mts`) and `lockExistsClause` (`lock-targets.mts`) — prevent an
  entity from being included in more than one in-flight batch.
- `orchestrator/*` — `createBatch`, `processBatch`/`retrieveBedrockBatch`, `downloadBatchResults`,
  `runStaleCleanup`, `cleanupBatchLocks`, and CSV/file-builder helpers used to assemble and poll
  Bedrock Batch API jobs.
- `entities/*` — per-entity (`topics`, `posts`, `rss_feed_items`, `crawl_chunks`, `images`) pending
  streams and batch-update appliers.

Batch lifecycle state is timestamp-derived. PostgreSQL requires submission before later states,
permits at most one of completed/failed/cancelled, and prevents a terminal result from being
cleared or replaced by a later poll.

## Environment routing

Bedrock jobs use the name `voucha-<environment>-<batch-id>`, where the environment comes from the
canonical deploy-environment resolver. Submission requires `ENVIRONMENT` to be explicitly set to
`development`, `test`, `staging`, or `production`; it fails before database, S3, or Bedrock side
effects when that routing identity is missing or invalid. The environment OpenTofu stack filters
Bedrock completion events by the matching name prefix so local jobs cannot enter a deployed
environment's SQS queue.

Roll this contract out independently per environment: deploy and verify the producer naming first,
then apply that environment's EventBridge filter. Jobs created with the old unscoped name before
the filter apply remain safe because the permanent poll dispatcher reconciles their terminal state.

## Related

- Base single-pipeline service and shared architecture diagram:
  [../bedrock-embeddings/README.md](../bedrock-embeddings/README.md)
- Worker: [../../workers/bedrock-embeddings-batch/README.md](../../workers/bedrock-embeddings-batch/README.md)
- Queue: [../../queues/bedrock-embeddings-batch/README.md](../../queues/bedrock-embeddings-batch/README.md)
