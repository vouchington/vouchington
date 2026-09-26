# Stories Service

Groups related RSS feed items covering the same news event into a first-class "story" entity.

## Overview

A **story** clusters articles about the same event together using embedding similarity + LLM heuristics. Stories have:

- **Title**: LLM-generated headline summarizing the cluster
- **`cluster_reason`**: LLM-generated explanation of why the articles were grouped together — displayed in the UI on the news cluster card
- **`published_at`**: When the event occurred (agent-determined, not row creation time)
- **`post__stories`**: Junction table linking one story post per story
- **Official item**: The canonical/primary source article (e.g. original press release) — admin-set only (`adminSetStoryOfficialItem`); the clustering path never sets it
- **Admin locks**: `story_locked_at` on items prevents auto-reassignment; `official_locked_at` on stories prevents agent override of admin's official pick

## Data Model

```
stories
  id                        UUIDv7 primary key
  title                     TEXT (nullable, 1–500 chars, LLM-generated)
  cluster_reason            TEXT (nullable, LLM-generated explanation for the grouping)
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
| `get.mts`                               | `getStoryById`, `getStoryWithItemCount`, `getStoryItemIds`, `getStoriesByIdBatch`, `getItemIdsByStoryIds`, `getPostStoryByStoryId`, `getPostStoryByPostId`, `getStoryItemSummaries`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `create.mts`                            | `createStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `update.mts`                            | `updateStoryTitle`, `adminSetStoryOfficialItem`, `createPostStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `assign.mts`                            | `adminAssignItemToStory`, `adminRemoveItemFromStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cluster.mts`                           | `clusterRssFeedItem` — orchestrator: eligibility checks, replay branch, Choice classifier dispatch, outcome branching                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `cluster-types.mts`                     | `ClusterResult`, `ClusterDependencies`, `ClusterDependencyOverrides` shared types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cluster-join.mts`                      | `assignItemToExistingStory` — atomically joins an item to the classifier-selected existing story                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `cluster-create-pair.mts`               | `createClusteredStoryPair` — atomically locks and claims the incoming item + selected standalone item, then creates a new story from both                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `cluster-fetch.mts`                     | `fetchClusterItem` — fetch an item for clustering eligibility check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `cluster-candidates.mts`                | `findClusterCandidates` — find nearest-neighbor candidates via pgvector                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `story-posts.mts`                       | `createStoryPost` / `prepareStoryPost` — public story-post creation boundary. Records durable related-URL projection intent, an `approve` clearance change, and post-commit delivery.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `story-post-create.mts`                 | Transactional story-post insert, topic relations, and publication capture used by `story-posts.mts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `story-post-related-url-projection.mts` | Generation-fenced, lease-based reconciliation of every eligible active story-member URL in bounded source, prune, and stale-state cleanup pages. Durable least-recently-claimed ordering rotates large continuations across pending posts, while generation-scoped mutation fences preserve manually re-confirmed links and copy into each restarted generation under the post-publication lock. Hostname ancestry uses indexed suffix equality rather than a leading-wildcard scan. Receipts make relation and crawl effects replayable; a five-minute schedule recovers missed enqueues. |
| `get-or-create-for-item.mts`            | `getOrCreateStoryForItem` — get or create a story for an item (for story post creation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `authorization.mts`                     | `currentUserCanCreateStoryPost` — any authenticated user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Clustering Algorithm

`clusterRssFeedItem(rss_feed_item_id, batchId)` runs after an embedding is created for an item. `batchId` is minted once when the job is enqueued (`mintStoryClusteringBatchId` in [`backend/queues/ai-agents/enqueues/story-clustering.mts`](../../queues/ai-agents/enqueues/story-clustering.mts)) and preserved across BullMQ retries, so a retried job replays the same classifier decision instead of re-deciding:

1. Fetch item; skip if deleted, locked (`story_locked_at`), or has no embedding
2. If item already has `story_id`, replay the (idempotent) post-commit side effects and return early — this path never consults `batchId` or the classifier
3. Find up to `STORY_CLUSTER_CANDIDATE_LIMIT` candidates by vector distance within the asymmetric time window
4. Dispatch one `dispatchStoryClusteringDecision` call (from [`@agents/story-clustering`](../../agents/story-clustering/)) — a Choice classifier over the (deduplicated) candidates plus an unbound `none`. A previously-committed decision for `batchId` short-circuits the candidate search and classifier call entirely (crash-safe replay)
5. Outcome `none` → return null, item stays standalone
6. Outcome `existing_story` → `assignItemToExistingStory` atomically joins the item to the selected story
7. Outcome `standalone` → `createClusteredStoryPair` atomically locks and claims **both** the incoming item and the selected standalone candidate (in `id` order, to avoid deadlocking against a concurrent pair-claim on the same two items), then creates a new story with deterministically derived `title` (from the selected item only, HTML-stripped/truncated), `published_at` (earlier of the two members'), and a fixed `cluster_reason`

Candidates include items **both with and without existing stories**. An item may be pulled into an existing story (joining its cluster) or form a new story with exactly one other standalone item — the new-story path is pair-only; it never bulk-merges more than two items in a single decision. The clustering path never sets a story's official item; that remains admin-only (`adminSetStoryOfficialItem`).

### Trigger Sources

`enqueueStoryClustering` is called from three places:

1. **Single-path embedding worker** ([`backend/workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts`](../../workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts)) — immediately after `upsertRssFeedItemEmbedding` writes the embedding vector.
2. **Batch-path save** ([`backend/services/bedrock-embeddings-batch/entities/rss-feed-items.mts`](../bedrock-embeddings-batch/entities/rss-feed-items.mts)) — for each item id returned by `applyRssFeedItemBatchUpdates` after a Bedrock batch result is applied.
3. **Batch-path copy-existing** (same file) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table by `copyExistingRssFeedItemEmbeddings` during batch creation.

All three paths use the same `debounce` dedup key (`story_clustering_${id}`, 60 s TTL), so rapid re-enqueues for the same item coalesce.

### Embedding Retry

The `processStoryClustering` processor mirrors the autotagger's embedding-retry pattern: if `clusterRssFeedItem` returns `null` and `hasRssFeedItemEmbedding` is `false`, the job re-enqueues itself with `embedding_retries + 1` and a 5 s delay, up to a cap of 10 retries. This handles narrow timing gaps where clustering fires before the embedding row is fully visible.

### Race Condition Handling

Joining an existing story locks the item row (`SELECT ... FOR UPDATE`) before the lifecycle lock and claim `UPDATE ... WHERE story_id IS NULL AND story_locked_at IS NULL RETURNING id`; an empty `RETURNING` means the item was assigned concurrently and the job is a no-op.

Creating a new story from a pair locks **both** candidate rows in one ordered `SELECT ... FOR UPDATE` before the story is created, so neither member can be claimed elsewhere between the decision and the claim; the subsequent claiming `UPDATE` is asserted to return exactly 2 rows as cheap defense-in-depth. Either check failing throws `StoryRaceConditionError`, which `createClusteredStoryPair` catches and turns into a `null` result — no story is left half-populated.

## Configuration

- `STORY_WINDOW_DAYS` env var (default 4, max 14) — forward window from story `published_at`
- `STORY_DISTANCE_THRESHOLD = 0.35` — cosine distance cutoff for candidate search
- `STORY_CLUSTER_CANDIDATE_LIMIT = 5` — max candidates sent to agent per item

## Related

- System: [backend/queues/ai-agents/README.md](../../queues/ai-agents/README.md) — job queue calling `clusterRssFeedItem`
- Agent (clustering): [`backend/agents/story-clustering/README.md`](../../agents/story-clustering/README.md) — Choice classifier candidate/outcome shaping
- Agent (story post): [`backend/agents/story-post/`](../../agents/story-post/) — LLM title + `ai_summary_markdown` generation
- API: [backend/api/v1/stories/README.md](../../api/v1/stories/README.md), [`backend/api/v1/stories/`](../../api/v1/stories/)
- Docs: [docs/requirements/content/stories.md](../../../docs/requirements/content/stories.md)
