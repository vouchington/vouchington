# Content analysis worker

Source entrypoint: [backend/workers/content-analysis/README.md](../../../../../../backend/workers/content-analysis/README.md)

CPU worker for `content-analysis`. It dispatches language jobs, copyright staydown hashing,
and abandoned-upload cleanup. The last two call the owning services; `staydown-hash` uses
Sharp to compute dHash from the stored image, with a 120-second worker lock.

Calls the `lingua-rs` N-API addon (75 languages, async libuv threadpool)
via a thin service layer that:

1. Skips detection when `lingua_rs_input_sha256` matches the current detection key (idempotent)
2. Uses declared/extracted language (RSS `<language>`, crawl `<html lang>`, post `language` field) when available
3. Otherwise calls `detectLanguage(Buffer)` and stores the raw JSONB result

## See also

- Queue: [`@queues/content-analysis`](../../content-analysis/README.md)
- Service: [`@services/language-detection`](../../../services/language-detection/README.md)

The processor accepts an optional owned entity-ID set when called directly, allowing scoped tests
of all six backfill handlers. Queued backfill jobs run the normal repository-wide cursor sweep.
Scoped dispatch preserves each stream's eligibility predicates and the same detector, guarded
writes, and entity-cache invalidation. The real GlideMQ dispatch test covers all registered job
names, including the six backfills.
