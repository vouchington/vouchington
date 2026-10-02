# Stories Service

Source entrypoint: [backend/services/stories/README.md](../../../../../backend/services/stories/README.md)

Groups related RSS feed items covering the same news event into a first-class "story" entity.

## Overview

A **story** clusters articles about the same event together using embedding similarity and a Choice classifier (`story-clustering-classifier`) that decides membership only. Stories have:

- **Title**: The cleaned title of the standalone item the clusterer matched when it founded the story (NULL when empty; readers fall back to the item's title). Admins can edit it
- **`cluster_reason`**: A fixed opaque string for clusterer-founded stories; no reader parses it
- **`published_at`**: When the event occurred (the earlier founding member's `published_at`, not row creation time)
- **`post__stories`**: Junction table linking one story post per story
- **Official item**: The canonical/primary source article (e.g. original press release). Clustering never sets it; an admin does
- **Admin locks**: `story_locked_at` on items prevents auto-reassignment; `official_locked_at` on stories keeps an admin's official pick

## Data Model

```
stories
  id                        UUIDv7 primary key
  title                     TEXT (nullable, 1–500 chars)
  cluster_reason            TEXT (nullable, fixed string for clusterer-founded stories)
  published_at              TIMESTAMPTZ (nullable, when the event occurred)
  official_rss_feed_item_id UUID FK → rss_feed_items.id (nullable)
  official_locked_at        TIMESTAMPTZ (set by admin)
  created_at                VIRTUAL (uuid_extract_timestamp)
  updated_at                TIMESTAMPTZ
  deleted_at                TIMESTAMPTZ

rss_feed_items (added columns)
  story_id        UUID FK → stories.id
  story_locked_at TIMESTAMPTZ (set by admin)

post__stories (junction table)
  post_id         UUID PK FK → posts.id
  story_id        UUID UNIQUE FK → stories.id
  initiated_by_id UUID FK → users.id
  created_at      TIMESTAMPTZ
```

## Files

| File                                    | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.mts`                             | `Story`, `StoryWithItemCount`, `PostStory` types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `get.mts`                               | `getStoryWithItemCount`, `getStoryItemIds`, `getStoriesByIdBatch`, `getPostStoryByStoryId`, `getPostStoryByPostId`, `getStoryItemSummaries`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `create.mts`                            | `createStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `update.mts`                            | `updateStoryTitle`, `adminSetStoryOfficialItem`, `createPostStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `assign.mts`                            | `adminAssignItemToStory`, `adminRemoveItemFromStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `clustering/adapter.mts`                | `createStoryClusteringRunAdapter` — the C9 `ClassifierRunAdapter` wiring the pieces below into the shared classifier-run lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `clustering/configuration.mts`          | `resolveStoryClusteringRunConfiguration` — the active prompt version, model and actor; its hash is the configuration half of the receipt identity                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `clustering/candidates.mts`             | `captureStoryClusteringCandidates` — the nearest stories and standalone items, captured once at reservation as a pure read before the item lock                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `clustering/readiness.mts`              | `hasCurrentStoryClusteringEmbedding`, `storyClusteringRequestEligibility` — reservation gate and sweep predicate                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `clustering/representatives.mts`        | `readStoryClusteringRepresentatives` — the member that stands in for each captured story in the prompt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `clustering/selection.mts`              | `selectStoryClusteringOutcome` — fail-closed mapping of the persisted Choice decision to none, existing story or standalone pick                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `clustering/effects.mts`                | `applyStoryClusteringEffects` — applies the outcome inside the completion transaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `clustering/membership.mts`             | `joinExistingStory`, `createStoryFromPair` — locked membership writes and the in-transaction story post refresh                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `clustering/metadata.mts`               | `deriveNewStoryMetadata`, `normalizeStoryTitle` — title, `published_at` and `cluster_reason` of a founded story                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `clustering/completion.mts`             | `completeStoryClusteringRun` — idempotent post-commit story replay (`afterCompleted`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `clustering/dispatch.mts`               | `dispatchStoryClusteringForEmbeddedItems` — best-effort dispatcher enqueue once an embedding is current                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `story-posts.mts`                       | `createStoryPost` / `prepareStoryPost` — public story-post creation boundary. Records durable related-URL projection intent, an `approve` clearance change, and post-commit delivery.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `story-post-create.mts`                 | Transactional story-post insert, topic relations, and publication capture used by `story-posts.mts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `story-post-related-url-projection.mts` | Generation-fenced, lease-based reconciliation of every eligible active story-member URL in bounded source, prune, and stale-state cleanup pages. Durable least-recently-claimed ordering rotates large continuations across pending posts, while generation-scoped mutation fences preserve manually re-confirmed links and copy into each restarted generation under the post-publication lock. Hostname ancestry uses indexed suffix equality rather than a leading-wildcard scan. Receipts make relation and crawl effects replayable; a five-minute schedule recovers missed enqueues. |
| `get-or-create-for-item.mts`            | `getOrCreateStoryForItem` — get or create a story for an item (for story post creation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `authorization.mts`                     | `currentUserCanCreateStoryPost` — any authenticated user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Clustering Algorithm

Clustering is the `story-clustering-classifier` run on the shared
[classifier-run lifecycle](../classifier-runs/README.md). The request, receipt, lease, attempt cap,
terminal failure, completion and sweep are shared; this package owns the candidate search, the mapping
from decision to membership, and the post-commit refresh.

1. An RSS upsert writes a durable run request for the item's content (`requestRssFeedItemClassifierRuns`).
2. Once the item's embedding was built from its current content, the dispatcher reserves a receipt. At
   that point `captureStoryClusteringCandidates` runs once, before the item lock is taken and as a
   pure read: the item must be live, embedded, from a discoverable source, unlocked and not already in
   a story. The candidates are kept only while the item's content and the configuration still match
   under the lock; otherwise the reservation searches again (at most 3 times, then `not-ready`).
3. Up to `STORY_CLUSTER_CANDIDATE_LIMIT` neighbors are found by vector distance within the asymmetric
   time window. Each distinct story is one candidate and each standalone item is one; they are stored
   in `classifier_run_candidates` and are not part of the receipt identity.
4. No candidates, or no longer clusterable, settles the request as no work: no model call.
5. Otherwise one Choice question lists the candidates plus `none` (see the
   [classifier agent](../../ai-agents/story-clustering/README.md)). The decision is persisted in
   `story_classifier_results`, one row per bound candidate with a `story_id` or `rss_feed_item_id`.
6. `selectStoryClusteringOutcome` joins a candidate only when its probability reaches the row's lower
   threshold. `none`, low-confidence, missing, malformed and partial answers join nothing.
7. `applyStoryClusteringEffects` runs in the completion transaction: a chosen story gains the item; a
   chosen standalone item founds a new story with the incoming item; anything that changed since the
   decision is skipped, never joined wrongly.
8. `completeStoryClusteringRun` (`afterCompleted`) replays the item's story after commit.

Candidates include items **both with and without existing stories**. An item may be pulled into an
existing story (joining its cluster) or form a new story with a standalone item. Members of
soft-deleted stories are not candidates. A candidate story that later loses every member or is
deleted is still described in the prompt structurally, so the decision covers exactly the candidates
the receipt reserved; joining a deleted story is skipped as `story_unavailable`.

### Storage

`story_classifier_results` has a nullable `story_id` and `rss_feed_item_id` with an exact-one `CHECK`,
partial unique indexes per entity and no mirrored per-kind table; it is partitioned by `RANGE (batch_id)`.
`classifier_run_candidates` carries `topic_id`, `story_id` and `rss_feed_item_id` the same way. The
`rss_feed_items.story_clustering_embedding_input_sha256` delivery marker no longer exists: the run
request and receipt are the durable state.

### Official Item And Metadata

Clustering is membership-only. It never writes `official_rss_feed_item_id`, so `official_locked_at` can
never be overridden. A founded story takes its title from the chosen standalone item (cleaned and
truncated to 500 code points), `published_at` from the earlier founding member and a fixed
`cluster_reason`.

### Trigger Sources

The dispatcher is enqueued by three embedding paths once the embedding is current:

1. **Single-path embedding worker** ([`backend/workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts`](../../../../../backend/workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts)) — immediately after `upsertRssFeedItemEmbedding` writes the embedding vector.
2. **Batch-path save** ([`backend/services/bedrock-embeddings-batch/entities/rss-feed-items.mts`](../../../../../backend/services/bedrock-embeddings-batch/entities/rss-feed-items.mts)) — for each item id returned by `applyRssFeedItemBatchUpdates` after a Bedrock batch result is applied.
3. **Reusable-copy reconciliation** (same file) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table by `copyExistingRssFeedItemEmbeddings` in the independent reconciliation lane.

The enqueue (`dispatchStoryClusteringForEmbeddedItems`) uses the stable per-item dispatcher job id and
is best effort. A failure is reported and never fails the embedding job. The `reconcile-classifier-runs`
sweep dispatches every pending request whose item is live at the requested content with a current
embedding, so there is no story-specific trigger marker, retry processor or scheduled recovery job.

### Race Condition Handling

All assignments use `UPDATE ... WHERE story_id IS NULL AND story_locked_at IS NULL RETURNING id` after
the items are locked `FOR UPDATE`. If the incoming item left, was locked or already joined a story, the
effect is skipped. If the chosen standalone item has meanwhile joined a story, the incoming item joins
that story. Founding a story assigns both members or neither. Two items that choose each other can
contend on the same row locks; PostgreSQL aborts one transaction, which rolls back with its run still
incomplete, so the job retry or the sweep completes it from the persisted decision without another
model call.

## Related item pages

`getStoryMemberPagesBatch` ([`story-member-pages.mts`](../../../../../backend/services/feeds/rss-feed-items/story-member-pages.mts)) and `getStoryById` ([`get-story-by-id.mts`](../../../../../backend/services/feeds/rss-feed-items/get-story-by-id.mts)) live in `@services/feeds`, not here, because `@voucha/tools` reads stories and this package reaches it through the story-clustering agent graph (a workspace cycle). `getStoryMemberPagesBatch` selects at most one page and a lookahead per story with a lateral index probe ordered by item ID descending. The `story_member_pages` feed/search/community sidecar contains related IDs only; the first direct result for each story is excluded before selection. Shared deliveries remain standalone. Members must pass the same source discoverability and viewer exclusions across those surfaces and story detail. `GET /api/v1/stories/:id` continues with an opaque story/viewer/access/exclusion-scoped cursor and hydrates only its selected page. The selection does not run the original request's search, follow, or community-list filters. The `story-related-items-config.preview_limit` dynamic setting controls preview size from 1 through 3 (default 3), read once per request. Story detail has a separate maximum of 25.

## Configuration

- `STORY_WINDOW_DAYS` env var (default 4, max 14) — forward window from story `published_at`
- `STORY_DISTANCE_THRESHOLD = 0.35` — cosine distance cutoff for candidate search
- `STORY_CLUSTER_CANDIDATE_LIMIT = 5` — max candidates in the one Choice question per item

## Related

- System: [docs/overview/architecture/queues/ai-agents/README.md](../../queues/ai-agents/README.md) — `classifier-run-dispatcher` and `classifier-run` jobs that run clustering
- Agent (clustering): [`backend/agents/story-clustering/`](../../../../../backend/agents/story-clustering/) — Choice classifier input builder and provider client
- Agent (story post): [`backend/agents/story-post/`](../../../../../backend/agents/story-post/) — LLM title + `ai_summary_markdown` generation
- API: [docs/requirements/api/v1/stories/README.md](../../../../requirements/api/v1/stories/README.md), [`backend/api/v1/stories/`](../../../../../backend/api/v1/stories/)
- Docs: [docs/requirements/content/stories.md](../../../../requirements/content/stories.md)
