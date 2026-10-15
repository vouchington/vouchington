# Images System

Source entrypoint: [backend/queues/image-uploads/README.md](../../../../../backend/queues/image-uploads/README.md)

Finalizes user uploads on the CPU worker without waiting behind background analysis. Upload
completion enqueues `extract-metadata` and returns a processing state; the worker publishes the
terminal image state for the client stream. Background image work runs on
[`content-analysis`](../content-analysis/README.md).

## Package split

This package (`@queues/image-uploads`) is the **API-safe** surface: queue, enqueue, and config. It declares no native binaries, so it is safe to include in the API deploy tree.

The worker-only code (the `Worker` class and the `sharp`-calling processor) lives in [`@workers/image-uploads`](../workers/image-uploads/README.md). Only the worker process imports `@workers/image-uploads`. This keeps `sharp` (~30 MiB native binary) out of the API image.

## Queue Configuration

### `image-uploads` (concurrency: 5, priority kind `none`)

- `extract-metadata` — receives only the image ID, reloads the row from the PostgreSQL primary, and
  requires its final key to match the persisted SHA-256 digest. It runs `sharp(...).metadata()`,
  validates the format, transitions the row from `processing` → `complete` (or `failed`), then fires
  `enqueueOnImageCreated`. It is enqueued with per-image `simple` deduplication and no custom job
  id. A custom id would stay claimed while a finished job's record is retained, and a job that
  stalls past its limit stays in the failed set even under `removeOnFail: true`, so the hourly
  re-enqueue would silently get `null`. Deduplication holds only while the earlier job is waiting,
  active, or retrying.
- **Lock duration**: 120,000 ms (2 min); stalled interval: 30,000 ms (default)

## Durable transition matrix

| Failure mode                           | Detectable state                                                                   | Recovery/reconciliation path                                                                      | Idempotency guarantee                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Dispatch failure                       | API has no committed final digest row                                              | Client retries completion while the row remains pending                                           | Row claim admits one completion                                              |
| Provider non-consumption               | `extract-metadata` remains waiting/failed                                          | GlideMQ retry or admin retry re-delivers the ID job                                               | Metadata transition accepts only processing rows                             |
| Provider consumption then DB failure   | Final digest exists but row is still processing                                    | Worker retry repeats the final-key read and metadata transition                                   | Immutable digest key and state predicate                                     |
| Durable commit then reply/enqueue loss | Processing row is older than one hour with `sha_256` and matching digest `s3_key`  | Content-analysis cleanup re-enqueues `extract-metadata` after commit                              | Stable per-image queue deduplication and authoritative DB reload             |
| Source-delete failure                  | Staged row is older than one hour and `upload_source_deleted_at` is null           | Hourly cleanup retries staging-only deletion for live rows or all known storage for terminal rows | Idempotent S3 deletion and durable deletion evidence                         |
| TTL expiry                             | Missing metadata job while the durable digest row remains processing               | Same one-hour cleanup recovery re-enqueues it                                                     | Stable per-image queue deduplication                                         |
| Finished job, row still processing     | Retained completed, failed, or stalled-failed metadata job and a processing row    | Same one-hour cleanup recovery re-enqueues it; the finished job does not hold a job id            | Per-image deduplication releases once the earlier job is completed or failed |
| Staydown hash enqueue loss             | Image has no `copyright_staydown_matches` row though it resembles a registered one | Entity-listener reconciliation replays `processImageCreated`, which re-enqueues the hash job      | Idempotent hash fill and match upsert; exact SHA-256 matching is unaffected  |
| Orphan cleanup                         | Incomplete nonterminal row exceeds 24 hours                                        | Cleanup terminalizes and deletes known storage; it does not terminalize durable digest rows       | `FOR UPDATE SKIP LOCKED` claim and source-deletion timestamp                 |
| Normal terminal removal                | Metadata row becomes complete or failed                                            | Worker finalizes status and cleanup clears any remaining staged source                            | Lifecycle predicates prevent a second terminal transition                    |

## Related

- Worker-only processor/worker: [../../workers/image-uploads/README.md](../workers/image-uploads/README.md)
- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- Images service: [../../services/images/README.md](../../services/images/README.md)
- AWS module (S3): [../../modules/aws/README.md](../../backend/modules/aws/README.md)
