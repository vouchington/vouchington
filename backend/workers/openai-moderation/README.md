# OpenAI Moderation Worker

Worker package for OpenAI moderation jobs.

## Exports

- `openai_moderation_omni_single` - worker instance for the `openai_moderation_omni_single` queue.

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

| Failure point                        | Durable state                                 | Recovery                                  | Terminal behavior                  |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| Initial dispatch or provider failure | Failed attempt and next `available_at`        | Reconciler re-enqueues at T+5/T+20        | Third failure appends `incomplete` |
| Worker loss while leased             | Expiring lease token                          | Reconciler re-enqueues after lease expiry | T+30 moves to review               |
| Content edit during provider call    | Prior immutable version and new content hash  | Entity listener starts the new version    | Late old-version result is ignored |
| Reconciler reply loss                | PostgreSQL work/disposition already committed | Next minute re-derives remaining work     | Completed work is not re-enqueued  |

## Related

- Queue surface: [../../queues/openai-moderation/README.md](../../queues/openai-moderation/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
