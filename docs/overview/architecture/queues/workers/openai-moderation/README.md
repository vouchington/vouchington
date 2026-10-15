# OpenAI Moderation Worker

Source entrypoint: [backend/workers/openai-moderation/README.md](../../../../../../backend/workers/openai-moderation/README.md)

Worker package for OpenAI moderation jobs.

## Exports

- `openAiModerationHandlers` (`handlers.mts`) - one handler per `openai-moderation` job, registered
  with the [background worker](../background/README.md). `handleOpenAIModerationOmniSingleJob`
  switches on the registry job name.

The native queue tests under `backend/workers/background/__tests__` verify the domain group's rate
limit and pause behavior; `workers/__tests__/workers.test.mts` covers the handler against real
PostgreSQL.

## Provider rate limits

An OpenAI 429 requeues the job after the provider's `Retry-After` (a minute when it sent none,
clamped to 1 second through 15 minutes) without consuming a queue attempt. The handler raises
`handleOpenAIRateLimit`'s `RateLimitError`; the background worker's processor converts it into
`job.rateLimitGroup`, so the delay rides on the job and every replica that receives a 429 honors it.
The `openai-moderation` group waits for that delay, which includes the `reconcile_*` and backfill
jobs of the domain, but no other domain on the shared worker stops: a raw `RateLimitError` would
idle the whole worker, which is why it never reaches GlideMQ.

## CSAM quarantine transfer

`reconcile_image_quarantines` runs once a minute with one queue attempt. PostgreSQL is the source
of truth: each run processes at most 25 non-deleted rows whose `quarantine_pending_at` is set.
The pending marker blocks ordinary application image reads before the permanent quarantine copy is
attempted. A failed copy preserves the source and marker for the next run; a confirmed copy is
followed by ordinary source/object deletion and permanent audit retention.

| Failure mode                                       | Detectable state                                | Recovery/reconciliation path                    | Idempotency guarantee                                       | Evidence (test)              |
| -------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ---------------------------- |
| Dispatch failure                                   | Pending row has no terminal deletion            | One-minute scheduler re-enqueues                | PostgreSQL scan re-derives work                             | `images.quarantine.test.mts` |
| Provider non-consumption                           | Pending row, no `quarantined_at`                | Next schedule repeats copy                      | Fixed destination key overwrites only the same evidence key | `images.quarantine.test.mts` |
| Provider consumption followed by DB-commit failure | Pending row, no copy timestamp                  | Next schedule repeats copy                      | Copy and durable state are idempotent                       | `images.quarantine.test.mts` |
| Durable commit followed by reply loss              | `quarantined_at` is set and row remains pending | Next schedule skips copy and completes deletion | Timestamp is durable copy evidence                          | `images.quarantine.test.mts` |
| Retry/reconciliation                               | Pending row                                     | Bounded one-minute scan                         | Pending marker is never cleared by retry                    | `images.quarantine.test.mts` |
| TTL expiry                                         | Queue record expires                            | Scheduler re-derives from PostgreSQL            | No queue record is authoritative                            | `enqueues.test.mts`          |
| Orphan cleanup                                     | Deleted row                                     | Existing image cleanup owns deleted storage     | Existing deletion is idempotent                             | `images.quarantine.test.mts` |
| Normal terminal removal                            | Deleted row with quarantine audit timestamps    | No further transfer work                        | Soft deletion removes ordinary visibility                   | `images.quarantine.test.mts` |

## Post moderation recovery

Post moderation queue jobs have one attempt. `post_moderation_work_items` is the retry source of truth,
and the one-minute `reconcile_post_moderation` job re-enqueues work at T+5 and T+20. Every claimed
attempt has a lease token; late completions cannot write through a newer lease or content version.
At T+30 the reconciler appends `incomplete` and projects the post into staff review.

A provider 429 is not an attempt: it says nothing about the post, and spending one of the three
attempts on it would send a post to staff review because OpenAI was busy. The processor calls
`releasePostModerationAttemptForRateLimit`, which in one lease-fenced statement deletes the open
attempt row, clears the lease, restores `attempt_count`, and holds `available_at` for the
provider's wait (never past the version's hard deadline) so the reconciler does not enqueue a
competing job. The requeued job then claims the same attempt number again.

| Failure point                        | Durable state                                               | Recovery                                  | Terminal behavior                       |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| Initial dispatch or provider failure | Failed attempt and next `available_at`                      | Reconciler re-enqueues at T+5/T+20        | Third failure appends `incomplete`      |
| Provider 429                         | Attempt withdrawn, `available_at` held to the `Retry-After` | Job requeued after the same wait          | Not counted; T+30 still moves to review |
| Worker loss while leased             | Expiring lease token                                        | Reconciler re-enqueues after lease expiry | T+30 moves to review                    |
| Content edit during provider call    | Prior immutable version and new content hash                | Entity listener starts the new version    | Late old-version result is ignored      |
| Reconciler reply loss                | PostgreSQL work/disposition already committed               | Next minute re-derives remaining work     | Completed work is not re-enqueued       |

## Related

- Queue surface: [../../openai-moderation/README.md](../../openai-moderation/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
