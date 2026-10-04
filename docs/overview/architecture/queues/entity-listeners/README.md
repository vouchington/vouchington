# Entity Listeners System

Source entrypoint: [backend/queues/entity-listeners/README.md](../../../../../backend/queues/entity-listeners/README.md)

Central event bus that listens for entity creation, update, and deletion events and fans out to
downstream systems. Processors are thin orchestrators — they call services and enqueue jobs, not
business logic.

## Architecture

All entity-listener enqueue functions (`enqueueOn*`) are **fire-and-forget**: they do not block the
caller, and errors are handled internally via `.catch(onError)`. Never `await` them in services.

The glide-mq vitest shim runs processors inline during tests, so awaiting would block the entire
downstream chain.

## Queue

Every processor uses the `entity-listeners` queue. The worker rejects a payload that does not match the named job before the processor runs. The normal entity processors and
`reconcileEntity` use priority 10 without group keys. The reconciliation dispatcher uses priority 100:

- User events use `processUserCreated`, `processUserLoggedIn`, and `processUserUpdated`.
- Topic events use `processTopicCreated`, `processTopicUpdated`, and `processTopicDeleted`.
- Post events use `processPostCreated`, `processPostUpdated`, and `processPostDeleted`.
- Image and URL creation use `processImageCreated` and `processUrlCreated`.
- `reconcileEntities` has no group key.

## Durable recovery

`reconcileEntities` runs hourly by default (configurable with
`ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS`) and is also available through the admin backfill
registry. It resumes a PostgreSQL checkpoint with a five-minute overlap, leaves a one-minute
replica-lag margin, streams active users/topics/images/URLs, and replays the append-only post
revision stream for exact create/update/delete semantics. Revision payloads preserve content-change
semantics without repeatedly resetting unchanged posts. Referred users
also replay their idempotent auto-follow relation. The dispatcher reconciles each candidate inline
and advances the checkpoint only after every entity processor finishes, so a Valkey wipe cannot
strand already-checkpointed child work. The scheduled dispatcher uses a time-bucketed unique job ID;
the separately exposed per-entity enqueue uses
`entity-reconcile__<type>__<id>__<changed-at-us>` as both `jobId` and simple deduplication ID.

Post category relations, votes, and primary vote stats are written in the post transaction. They
need no category recovery job; the post service publishes cache invalidation and notification
reconciliation after commit. See the [post service](../../services/posts/README.md).

## processPostCreated

Triggered by `enqueueOnPostCreated(postId)` after a post is inserted.

Core post-created work runs before URL/cache recovery. A recovery failure still rejects the job so
GlideMQ retries it and reconciliation leaves its checkpoint unchanged, but that retryable failure
cannot suppress moderation, subscriptions, embeddings, metrics, or the other core fan-out.
Recovery reads creation-time URL relations, approved reviews, URLs, and story links from the primary
database so replica lag cannot acknowledge an incomplete repair.
Creation-moderation recovery trusts the explicit bypass marker on new posts. For pre-marker posts,
it also requires the original create revision, initial creator approval, and an administrator role
that predates the post; an explicit false marker prevents that historical inference.

Downstream systems triggered (all fire-and-forget):

- If `created_by_id` exists, create the author's +1 vote through
  `@services/elections-votes/post` and bookmark through `@services/bookmarks/upsert`.
- Always process @mentions through the `post-mentions` queue.
- For `pending` posts, enqueue `bedrock_embeddings_nova_multimodal_v1_single` and
  `openai_moderation_omni_single` (one attempt, like every other creation-moderation enqueue), and
  run `spam_detection` before clearance. Approval writes the durable `classifier_run_requests` for
  the post classifier and the tagging classifier in the approval transaction.
- For `approved` posts, enqueue `bedrock_embeddings_nova_multimodal_v1_single` and record the
  tagging request (`requestApprovedPostClassifierRuns`) followed by a stable-id classifier-run
  dispatcher. The dispatcher waits for the post embedding; the sweep covers the wait.
- For comments, refresh ancestor metrics through the `entity-metrics-cache-refresh` queue.

> **Note:** Post revisions are tracked synchronously in the `createPost()` / `updatePost()` / `deletePost()` transactions, not via the entity-listeners queue.

Public cache, topic-rating, sitemap, and subscription-notification projections are driven by the
durable `post-publication` queue, not these listeners.

### Durable transition matrix

| Failure mode                                       | Detectable state                                                                  | Recovery/reconciliation path                                                                 | Idempotency guarantee                                                                       | Evidence (test)                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dispatch failure                                   | The durable post/revision exists without a completed listener delivery.           | Hourly entity reconciliation derives and processes the missing candidate.                    | Current-state reads, relation uniqueness, and downstream deduplication make replay safe.    | `processors/reconciliation.test.mts` — leaves the checkpoint unchanged when an entity fails                                    |
| Provider non-consumption                           | A downstream queue or provider has no completed effect for the durable post.      | The listener retry or hourly reconciliation re-enqueues from current post state.             | Downstream queues and services own stable IDs, upserts, and deduplication.                  | `processors/__tests__/posts.admin-created.test.mts` — completes core dispatch before propagating a recovery failure for retry  |
| Provider consumption followed by DB-commit failure | An earlier effect exists while a later durable write or enqueue rejects.          | The whole listener retries; reconciliation holds its checkpoint until every effect succeeds. | Creator votes, subscriptions, cache work, and enqueue boundaries are idempotent.            | `processors/reconciliation.test.mts` — leaves the checkpoint unchanged when an entity fails                                    |
| Durable commit followed by reply loss              | Post-created effects exist but the queue attempt has no terminal acknowledgement. | GlideMQ redelivers the same post ID.                                                         | The processor derives current state and repeats only idempotent service/enqueue operations. | `processors/__tests__/posts.admin-created.test.mts` — completes core work before post-create recovery                          |
| Retry/reconciliation                               | A failed job or an unadvanced PostgreSQL checkpoint remains observable.           | GlideMQ retries first; hourly reconciliation replays any missed durable candidate.           | The post ID is the stable logical identity across both paths.                               | `processors/reconciliation.test.mts` — advances the durable checkpoint only after every entity finishes                        |
| TTL expiry                                         | Queue history may expire while the post and append-only revision remain durable.  | The next reconciliation window re-derives the candidate from PostgreSQL.                     | Revision ordering and current-state processors prevent duplicate logical effects.           | `processors/reconciliation.test.mts` — routes every entity type through its idempotent current-state processor                 |
| Orphan cleanup                                     | A retained completed/failed queue record is removed while source state remains.   | No queue record is authoritative; PostgreSQL reconciliation remains the recovery owner.      | Durable entity and revision identities outlive queue retention.                             | `processors/reconciliation.test.mts` — advances the durable checkpoint only after every entity finishes                        |
| Normal terminal removal                            | The listener attempt succeeds after core work and recovery both complete.         | GlideMQ applies normal completed-job retention; no repair is needed.                         | Replaying the same post ID remains safe if reconciliation overlaps.                         | `processors/__tests__/posts.admin-created.test.mts` — recovers both canonical and source URL effects for redirected link posts |

## processPostUpdated

Triggered by `enqueueOnPostUpdated(postId, { contentChanged })`.

- On `contentChanged`, reset clearance through `@services/post-clearance` and rerun the
  `spam_detection` queue.
- On `contentChanged` with an approved community review, rerun the `community_moderation` queue.
- Always rerun the `openai_moderation_omni_single` queue and process @mentions through the
  `post-mentions` queue.
- For comments, refresh ancestor metrics through the `entity-metrics-cache-refresh` queue.

## processPostDeleted

Triggered by `enqueueOnPostDeleted(postId)`.

- For comments, refresh ancestor metrics through the `entity-metrics-cache-refresh` queue.

Reconciliation uses `entity-reconciliation-work-config` page and run limits and reports `hasMore`.
Capped queue continuations retain the exact window and the last successfully processed composite
position: epoch microseconds, entity ID, entity type, and nullable change ID (NULL last).
Microseconds remain strings rather than passing through JavaScript Date. Failures enqueue the
last successful position before retrying; only a drained window advances the durable checkpoint.
Losing a continuation replays the unchanged checkpoint window through the scheduled recovery path.

## Related

- Full post creation pipeline: [docs/overview/architecture/post-lifecycle.md](../../post-lifecycle.md)
- Systems conventions: [`../AGENTS.md`](../../../../../backend/queues/AGENTS.md)
- Services: [`../../services/AGENTS.md`](../../../../../backend/services/AGENTS.md)
- Reconciliation service: [`../../services/entity-listener-reconciliation/README.md`](../../services/entity-listener-reconciliation/README.md)
- Triggered systems:
  - [`../bedrock-embeddings/README.md`](../bedrock-embeddings/README.md)
  - [`../openai-moderation/README.md`](../openai-moderation/README.md)
  - [`../elections/README.md`](../elections/README.md)
