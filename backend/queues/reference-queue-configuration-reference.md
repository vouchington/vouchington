# Queue Configuration Reference

[Back to Systems Summary](README.md#queue-configuration-reference)

### Decision Table

Pick config by job shape:

| Job shape                      | `attempts` | `backoff.delay` | dedup mode                             | `priority`            |
| ------------------------------ | ---------- | --------------- | -------------------------------------- | --------------------- |
| External API (OpenAI, crawler) | 3          | 5000 ms         | `throttle`                             | `PRIORITY_DEFAULT`    |
| DB write / cache invalidation  | 3          | 1000 ms         | `debounce` (no ordering) or `throttle` | `PRIORITY_DEFAULT`    |
| Dispatcher (cron)              | 3          | 5000 ms         | `throttle`                             | `PRIORITY_DISPATCHER` |
| Stripe / payment event         | 5          | 10000 ms        | `simple`                               | `PRIORITY_DEFAULT`    |
| Long batch (export, sitemap)   | 3          | 30000 ms        | `simple`                               | `PRIORITY_DISPATCHER` |

### Deduplication Semantics

GlideMQ deduplication reduces duplicate enqueue work; it is not the system's durable correctness
boundary. Processors must still be idempotent against Postgres or another durable source of truth.

- `simple` is for one-shot jobs where a repeated enqueue with the same dedup ID should be skipped
  by the queue. Treat the guarantee as Valkey/GlideMQ command-scoped, not as a cross-round-trip
  uniqueness invariant that can replace service-level idempotency.
- `throttle` is for dispatcher-style jobs where repeated triggers should collapse for a fixed TTL.
- `debounce` is for delay-reset scenarios; do not combine it with ordering keys.

Tests should assert that enqueue helpers pass the expected deduplication options and that processors
are idempotent. Do not add brittle tests that try to prove GlideMQ internals skip duplicate `simple`
jobs across concurrent or repeated client round trips.

### Required Job Options

Every `queue.add()`, `queue.addBulk()`, and `queue.upsertJobScheduler()` must include:

- `attempts` — integer in `[1, 10]`. **Default is `1` when omitted (no retry)** — always set explicitly. Use `3` for most jobs.
- `backoff` — required when `attempts > 1`; use exponential with delay ≥1000 ms.
- `removeOnComplete` — at least `100`. Exception: `true` is permitted when a stable custom `jobId`
  must release its uniqueness claim the moment the job finishes, accepting the loss of that job's
  entry in the terminal-job history — see [Define a replay-safe
  job](../../docs/checklists/reference-backend-queues-define-a-replay-safe-job.md#define-a-replay-safe-job).
- `removeOnFail` — at least `100`. Same stable-`jobId` exception applies.
- `priority` — `PRIORITY_DEFAULT = 10` for regular jobs, `PRIORITY_DISPATCHER = 100` for dispatchers.
  Security-critical ActivityPub inbox retention cleanup is priority `1`, ahead of ordinary
  delivery work, so expired capacity cannot be starved by a saturated inbox.

See [CLAUDE.md](CLAUDE.md) for enforcement rules and deduplication mode details.
