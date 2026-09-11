# Images System

Owns asynchronous image work that should not block the API request path:

1. Cleans up abandoned (orphaned) image uploads from S3.
2. Extracts image metadata after upload completion so the API can return a `processing` response immediately.

## Package split

This package (`@queues/images`) is the **API-safe** surface: queues, enqueues, config, and schedules. It declares no native binaries, so it is safe to include in the API deploy tree.

The worker-only code (the `Worker` class and the `sharp`-calling processor) lives in [`@workers/images`](../../workers/images/README.md). Only the worker process imports `@workers/images`. This keeps `sharp` (~30 MiB native binary) out of the API image.

## Queue Configuration

### `images` (concurrency: 5)

- `cleanup-abandoned-uploads` — re-enqueues metadata for processing rows older than one hour when
  their durable `sha_256` and digest `s3_key` prove final storage was committed but an
  enqueue-after-commit handoff was missed. The same bounded pass retries staging-source deletion
  when durable deletion evidence is missing. Only after the 24-hour abandonment window does it
  claim incomplete nonterminal rows with `FOR UPDATE SKIP LOCKED`, terminalize them, delete known
  storage outside the lock, and record successful source deletion as evidence.
- `extract-metadata` — receives only the image ID, reloads the row from the PostgreSQL primary, and
  requires its final key to match the persisted SHA-256 digest. It runs `sharp(...).metadata()`,
  validates the format, transitions the row from `processing` → `complete` (or `failed`), then fires
  `enqueueOnImageCreated`.
- **Lock duration**: 120,000 ms (2 min); stalled interval: 30,000 ms (default)

## Durable transition matrix

| Failure mode                           | Detectable state                                                                  | Recovery/reconciliation path                                                                      | Idempotency guarantee                                            |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Dispatch failure                       | API has no committed final digest row                                             | Client retries completion while the row remains pending                                           | Row claim admits one completion                                  |
| Provider non-consumption               | `extract-metadata` remains waiting/failed                                         | GlideMQ retry or admin retry re-delivers the ID job                                               | Metadata transition accepts only processing rows                 |
| Provider consumption then DB failure   | Final digest exists but row is still processing                                   | Worker retry repeats the final-key read and metadata transition                                   | Immutable digest key and state predicate                         |
| Durable commit then reply/enqueue loss | Processing row is older than one hour with `sha_256` and matching digest `s3_key` | Hourly cleanup re-enqueues `extract-metadata` after commit                                        | Stable per-image queue deduplication and authoritative DB reload |
| Source-delete failure                  | Staged row is older than one hour and `upload_source_deleted_at` is null          | Hourly cleanup retries staging-only deletion for live rows or all known storage for terminal rows | Idempotent S3 deletion and durable deletion evidence             |
| TTL expiry                             | Missing metadata job while the durable digest row remains processing              | Same one-hour cleanup recovery re-enqueues it                                                     | Stable per-image queue deduplication                             |
| Orphan cleanup                         | Incomplete nonterminal row exceeds 24 hours                                       | Cleanup terminalizes and deletes known storage; it does not terminalize durable digest rows       | `FOR UPDATE SKIP LOCKED` claim and source-deletion timestamp     |
| Normal terminal removal                | Metadata row becomes complete or failed                                           | Worker finalizes status and cleanup clears any remaining staged source                            | Lifecycle predicates prevent a second terminal transition        |

## Related

- Worker-only processor/worker: [../../workers/images/README.md](../../workers/images/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
- Images service: [../../services/images/README.md](../../services/images/README.md)
- AWS module (S3): [../../modules/aws/README.md](../../modules/aws/README.md)
