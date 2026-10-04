# Bedrock Embeddings Batch Service

Source entrypoint: [backend/services/bedrock-embeddings-batch/README.md](../../../../../backend/services/bedrock-embeddings-batch/README.md)

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
[`bedrock-batch-sqs` worker](../../queues/workers/bedrock-batch-sqs/README.md) and must not pull in
AWS-SDK-only or `pg-copy-streams` transitive dependencies.

## Public Helpers

- `processBatchCreation(...)` (`utils.mts`) — checks provider capacity, assembles a batch file for pending entities, submits it via `createBatch`, and
  records lock rows.
- `copyExisting{Topic,Post,RssFeedItem}Embeddings(...)` (`entities/*`) — scans at most 100 dirty
  candidates in UUID order, then applies eligibility, lock, and centralized-cache checks. Every
  scanned candidate advances the opaque scoped cursor, even a cache miss or locked row. A full
  page returns a cursor; the independent reconciliation worker enqueues its continuation. Copying
  does not consult Bedrock provider capacity. Cursorless scheduled roots revisit skipped rows.
- `processImageBatchCreation(...)` (`utils.mts`) — assembles and submits image batch files under the
  same provider-capacity limits.
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

Pending-entity reads use registered cursor batch sizes and a per-run scan budget in
`bedrock-embeddings-batch-config`. Creation reports `hasMore` and carries a fixed UUID sweep bound
and last attempted position in its continuation (crawl chunks additionally retain the chunk order).
Chunk scans use crawl ID descending and chunk order ascending for a stable resume order.
Poison images count as attempted work; their continuation advances to the tail, and the next
scheduled root sweep retries them. Healthy images below the minimum travel as bounded IDs in the
continuation; their eligible replay consumes the next run's scan allowance before new candidates.
Submitted or no-longer-eligible IDs drop, and an unsubmitted boundary image remains pending.
A smaller subsequent configuration drains a bounded prefix without dropping the carried tail.
When a complete sweep has fewer healthy records than the minimum, scheduled roots revisit them.
Provider denial retains the cursor and carried IDs in a delayed, non-throttled continuation.

The scan budget must be at least the configured minimum batch size. Staff edits validate this
against merged current fields, and runtime validation rejects an invalid combination before file,
cursor, or provider side effects. The configured file size must also fit the minimum at the maximum
converted-image record size, including base64 and the canonical JSON framing. Effective remaining
provider capacity below that minimum schedules a retry using `creation_retry_delay_ms`; it does not
scan or abandon a partial page. These constraints preserve the configured work cap.

Capacity checks cover the exact JSON framing and worst-case escaping for text records as well as
base64 image records. Stored minima must fit both hourly and per-file request ceilings. Cloud
submission failures leave retries to the current job and do not also spawn a forward continuation.

## Related

- Base single-pipeline service and shared architecture diagram:
  [../bedrock-embeddings/README.md](../bedrock-embeddings/README.md)
- Worker: [../../workers/bedrock-embeddings-batch/README.md](../../queues/workers/bedrock-embeddings-batch/README.md)
- Queue: [../../queues/bedrock-embeddings-batch/README.md](../../queues/bedrock-embeddings-batch/README.md)
