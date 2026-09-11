Review crawler and RSS ingestion behavior. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [RSS feed crawling](../../../docs/requirements/content/RSS-FEED-CRAWLING.md) and [Crawling](../../../docs/overview/architecture/crawling.md) against robots.txt handling, domain rate limits, retries, dedupe, feed parsing, content sanitization, and crawl queue behavior.
- Prefer fixes that improve correctness, politeness, reliability, or observability without increasing crawl load.
- Keep user-visible feed and story behavior aligned with those requirements.
- Add or tighten targeted tests for the selected crawler or RSS behavior.
- Conditional queue gate: if the selected improvement changes a queue, worker, processor, job
  payload, retry/backoff, deduplication, scheduler, or backfill, invoke `$voucha-queue-authoring`
  and `$backend-vitest-test-authoring`, then follow
  [`docs/checklists/backend-queues.md`](../../../docs/checklists/backend-queues.md). Do not add a
  processor-owned replacement-job retry loop unless its intent comes from durable source-of-truth
  state and repeated delivery is idempotent. Prove the changed path at real PostgreSQL, Valkey, and
  GlideMQ boundaries, using production-created error classes and asserting the observable queued
  job and options. Mocked or injected internal queue, worker, or service dependencies and
  fabricated error-shaped objects are not sufficient evidence. Update the relevant worker README
  when queue behavior changes.
