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

The processor accepts an optional owned entity-ID set when called directly. The internal worker
factory also accepts a finite invocation scope: copied entity IDs for all six backfills, copied
image IDs for every cleanup stage, and one copied cleanup clock. Empty ID sets select no rows.
Production omits this scope and retains the normal repository-wide sweeps and cleanup cutoffs;
job payloads are unchanged. Importing `processors/create-content-analysis-worker.mts` does not start the production singleton
in `workers.mts`, so a scoped worker does not also start an unscoped worker during collection.
Scoped dispatch preserves each stream's eligibility predicates and the same detector, guarded
writes, and entity-cache invalidation. The real GlideMQ dispatch test covers all registered job
names in one case, including the six backfills and the cleanup result's three fields.

[`createContentAnalysisCleanupFixtures`](../../../../../../backend/test-helpers/content-analysis-cleanup-fixtures.mts)
uses the real upload, claim, digest, and promotion producers without changing upload timestamps.
Its invocation clock makes owned and foreign controls eligible together. The worker test answers
only owned S3 deletes at the external SDK boundary, verifies unchanged foreign rows and language
state, and reads owned recovery and cache-purge admissions by their public job IDs. The user
backfill's cache invalidation admits a bulk purge asynchronously, so its canonical completion
promise is joined too. Teardown re-reads each job and removes only exact owned image IDs or the
exact owned user ID/slug tags; foreign or mixed payloads fail closed. Neither shared queue is
cleared.
