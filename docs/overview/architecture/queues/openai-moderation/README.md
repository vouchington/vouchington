# OpenAI Moderation System

Source entrypoint: [backend/queues/openai-moderation/README.md](../../../../../backend/queues/openai-moderation/README.md)

Queue system for OpenAI omni moderation jobs.

## Domain

| Queue        | Job                                                    | Group                                      | Default Priority |
| ------------ | ------------------------------------------------------ | ------------------------------------------ | ---------------- |
| `background` | `openai-moderation.post`                               | `openai-moderation` (10 starts per second) | 10               |
| `background` | `openai-moderation.image`                              | `openai-moderation` (10 starts per second) | 10               |
| `background` | `openai-moderation.backfill_posts` / `backfill_images` | `openai-moderation` (10 starts per second) | 100              |
| `background` | `openai-moderation.reconcile_image_quarantines`        | `openai-moderation` (10 starts per second) | 100              |
| `background` | `openai-moderation.reconcile_post_moderation`          | `openai-moderation` (10 starts per second) | 100              |

These are the `openai-moderation` domain of the [background queue](../background/README.md). The
domain group runs at most 5 jobs at once (the old worker concurrency), its `rateLimit` of 10 starts
per second replaces the old queue-wide `limiter`, and the domain can be paused from the operator API.

## Responsibilities

- run OpenAI moderation on posts and images
- persist typed, provider-neutral dispositions in the immutable post moderation ledger
- backfill missing results one bounded page at a time: `backfill_posts` and `backfill_images` enqueue a
  page of ids (the `backfill_batch_size` field), then enqueue a continuation job carrying the page's
  last id at dispatcher priority, so no more than one page of moderation jobs waits ahead of it
- trigger follow-up clearance and notification reconciliation
- every minute, retry the bounded PostgreSQL set of CSAM image quarantine transfers whose durable
  `quarantine_pending_at` marker blocks ordinary image lookup
- every minute, re-derive due T+5/T+20 retries and the T+30 fail-closed review transition from
  PostgreSQL; queue jobs have one attempt because PostgreSQL owns retry state
- on an OpenAI 429, requeue the job after the provider's `Retry-After` without consuming a queue
  attempt or a ledger attempt (see the [worker](../workers/openai-moderation/README.md#provider-rate-limits))

## Related

- Service rules: [../../services/openai-moderation/README.md](../../services/openai-moderation/README.md)
- Systems overview: [../README.md](../README.md)
