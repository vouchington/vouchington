---
name: voucha-queue-authoring
description: Voucha GlideMQ queue conventions - packages, payloads, enqueues, workers, retries, schedules. Use when adding or changing anything under backend/queues, backend/workers, or an enqueue call.
---

# Voucha Queue Authoring

Load `glide-mq` and `queue-rules` first; they own the generic rules (priority kinds, shared
queues, ordering lanes, payload safety, replay, job IDs, backlog guards, schedulers, flows,
backfills, transition matrix). This skill holds Voucha's package, registry, and policy facts.

## Placement

- Queue configuration, payload types, enqueue APIs, and scheduler registration live in
  [`backend/queues/<domain>/`](../../../backend/queues/) and never import workers. Registrations
  and thin processors live in [`backend/workers/<domain>/`](../../../backend/workers/). Fetching,
  authorization, durable writes, business logic, and durable idempotency live in services.
- Worker placement is data-driven in
  [`worker-queue-policy.json`](../../../backend/modules/worker-queue-inventory/worker-queue-policy.json).
- Update the domain queue/worker README, the
  [queue inventory](../../../docs/overview/architecture/queues/README.md), and, when applicable,
  the replayability matrix, scheduled/backfill registries, and placement policy.
- A queue contract change rewrites producers and workers together, with no drain, compatibility
  path, or migration for old jobs, per the root [AGENTS.md](../../../AGENTS.md) "One current
  contract" rule (keep an exact replay envelope only where a replay contract requires it).

## Priorities, lanes, and the shared queue

- Task jobs use the queue's default priority; dispatchers, cleanup, recovery, and backfills use
  the dispatcher tier so they run behind the tasks they create.
- Register a domain in the [background queue](../../../docs/overview/architecture/queues/README.md)
  registry rather than adding a queue. Pause, retry, and stats are per domain, and pausing is a
  domain-control database field, not `Queue.pause()`
  ([#2855](https://github.com/vouchington/vouchington/issues/2855)).
- Never throw `RateLimitError` or call `worker.rateLimit()` from a shared worker; defer with
  `job.rateLimitGroup` or `job.moveToDelayed`. Classify external 429 and `Retry-After` through
  `@modules/queue-errors`.
- Every shared-queue job sets a domain-prefixed `ordering` key. Its `concurrency` is a global cap
  read from DynamicConfig, never derived from `workerConcurrency`.
- A cap that must survive deferral is a token-owned Valkey lease released before `moveToDelayed`
  ([#3598](https://github.com/vouchington/vouchington/issues/3598)).
- Latency-critical person-watched work (login emails, upload finalization) gets its own queue.

## Fan-out and schedules

- Use the [paged-dispatcher helper](../../../backend/data-stores/valkey-glide-mq/paged-dispatcher.mts)
  with DynamicConfig page, queue-depth, and backoff limits; dispatchers retry indefinitely and
  keep state in job data, not PostgreSQL. Cursor keys are unique and never move backward; a
  forward-only timestamp qualifies only when advancing it takes the row out of the reader's filter
  (the RSS dispatcher's healthy lanes `lastFetchSucceededAt,id` and failing retry lane `lastFetchFailedAt,id` are the one user). The depth threshold is a soft admission limit that
  includes dispatcher jobs; a threshold below an unread control backlog blocks admission until an
  operator raises it. Record ownership of row-admission fences before bulk enqueue and clean them
  in bounded batches after the page receipt is durable. To re-admit a retained terminal row, WATCH
  its job hash on a dedicated connection and remove it with GlideMQ's native function in the same
  transaction.
- Define every scheduled job through `@modules/scheduled-job-manifest` (scheduler ID, repeat rule,
  template, environment gate, typed operator surface). Build template options with
  `toSchedulerTemplateOptions`. Keep `schedules.mts` with an empty `jobs` array and its
  `SCHEDULE_DEFINITIONS` entry when the last job is removed. Never call `removeJobScheduler`
  outside the manifest helper.
- Register every replayable queue in `BACKFILL_REGISTRY` and record exclusions and replay
  contracts in [`JOB-REPLAYABILITY.md`](../../../docs/requirements/platform/JOB-REPLAYABILITY.md).
- Terminal recovery paths follow
  [job replayability](../../../docs/requirements/platform/JOB-REPLAYABILITY.md#rules-for-new-jobs).
- MUST NOT run several sweeps, stages, or phases in one job; give each its own job name, cursor,
  cap, retry policy, and failure boundary. Never share a mutable budget, tally, error list, or
  cursor map across stages; bound load through the queue's ordering lane and concurrency.

## Double requests, billing, and mail

- Re-read the entity's state in the PostgreSQL primary when the job starts, use stable job or
  deduplication IDs, and pass provider idempotency keys. Write the result and the state marking it
  done in one transaction.
- Billing, telemetry, and analytics are reporting only: record them as each request happens, but
  never read them at runtime to decide, gate, or deduplicate work, and never add a reservation key,
  receipt ledger, or "may have been billed" state for paid calls.
- Post-commit admission settles the API response, not worker completion. Canonical post
  create/update and URL-created service call sites await the queue-owned `BestEffort` admission
  facade after their mutation commits; topic creation's post-commit finalizer awaits its
  topic-created admission. They keep the committed mutation and report an enqueue failure once.
- Moderation summaries are marked after local send checks and before SES. A failed preference or
  suppression lookup retries without a mark; a definitive sending-rate rejection clears the mark;
  an unknown send outcome keeps it. A lost summary is accepted if execution stops or the mark
  acknowledgement is lost. Keep the queued period's timezone in the job.

## Tests and transition matrices

- Test service behavior with real PostgreSQL, Valkey, and GlideMQ; never mock internal queues,
  workers, services, or data stores. Find an enqueued job with `searchJobs` or by id, not
  `getJobs('waiting')`; see [GlideMQ testing](../../../docs/development/testing/backend/glide-mq-testing.md).
- Effectful worker/RPC operations ship a filled-in transition matrix in their owning README
  (`glide-mq` skill, references/transition-matrix.md). Financial (Stripe) operations also fill
  in the [financial variant](../../../docs/checklists/reference-financial-stripe-variant.md).

For sweeps and cleanup jobs, apply the
[bounded-iteration skill](https://github.com/jonathanong/harness-plugins/blob/main/skills/bounded-iteration/SKILL.md).
