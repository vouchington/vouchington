# Bedrock Embeddings Batch Worker

Source entrypoint: [backend/workers/bedrock-embeddings-batch/README.md](../../../../../../backend/workers/bedrock-embeddings-batch/README.md)

Worker package for batch embedding creation, polling, and provider-free reconciliation jobs.

The `reconciliation` ordering lane has concurrency 1. `reconcile_existing` processes one page for
topics, posts, or RSS feed items; `post_trigger_recovery` processes its pending-delivery page. Each job enqueues exactly one continuation when its
service returns an opaque cursor. Empty and partial pages stop. Unknown entities, malformed
payloads, and invalid scoped cursors fail unrecoverably; transient storage or queue failures retry.

| Transition               | Durable state                                                  | Retry or recovery                                                                           |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Reusable embedding found | Entity input SHA and vector update under current-content guard | Repeating the copy skips current rows; the next cursorless root revisits skipped candidates |
| Post trigger accepted    | Exact embedding input marker advances after queue acceptance   | Failed, skipped, or stale-input delivery remains pending for a later root                   |
| Full page scanned        | One cursor continuation is awaited                             | A lost continuation is recovered by the next cursorless root or operator backfill           |

The two reconciliation producers share
[reconciliation-page.mts](../../../../../../backend/workers/bedrock-embeddings-batch/processors/reconciliation-page.mts)
for reading one page and awaiting its optional continuation. Production producers and the page
contract tests use this same component.

## Exports

- `bedrock_embeddings_batch` - worker instance for the `bedrock-embeddings-batch` queue.

## Related

- Queue surface: [../../queues/bedrock-embeddings-batch/README.md](../../bedrock-embeddings-batch/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md)
