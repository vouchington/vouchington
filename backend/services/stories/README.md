# Stories Service

Groups related RSS feed items covering the same news event into a first-class "story" entity.

## Overview

A **story** clusters articles about the same event together using embedding similarity + LLM heuristics. Stories have:

- **Title**: LLM-generated headline summarizing the cluster
- **`cluster_reason`**: LLM-generated explanation of why the articles were grouped together — displayed in the UI on the news cluster card
- **`published_at`**: When the event occurred (agent-determined, not row creation time)
- **`post__stories`**: Junction table linking one story post per story
- **Official item**: The canonical/primary source article (e.g. original press release)
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
| `update.mts`                            | `updateStoryTitle`, `setStoryOfficialItem`, `adminSetStoryOfficialItem`, `createPostStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `assign.mts`                            | `adminAssignItemToStory`, `adminRemoveItemFromStory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cluster.mts`                           | `clusterRssFeedItem` — core incremental clustering algorithm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `cluster-fetch.mts`                     | `fetchClusterItem` — fetch an item for clustering eligibility check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `cluster-candidates.mts`                | `findClusterCandidates` — find nearest-neighbor candidates via pgvector                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `story-posts.mts`                       | `createStoryPost` / `prepareStoryPost` — public story-post creation boundary. Records durable related-URL projection intent, an `approve` clearance change, and post-commit delivery.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `story-post-create.mts`                 | Transactional story-post insert, topic relations, and publication capture used by `story-posts.mts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `story-post-related-url-projection.mts` | Generation-fenced, lease-based reconciliation of every eligible active story-member URL in bounded source, prune, and stale-state cleanup pages. Durable least-recently-claimed ordering rotates large continuations across pending posts, while generation-scoped mutation fences preserve manually re-confirmed links and copy into each restarted generation under the post-publication lock. Hostname ancestry uses indexed suffix equality rather than a leading-wildcard scan. Receipts make relation and crawl effects replayable; a five-minute schedule recovers missed enqueues. |
| `get-or-create-for-item.mts`            | `getOrCreateStoryForItem` — get or create a story for an item (for story post creation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `authorization.mts`                     | `currentUserCanCreateStoryPost` — any authenticated user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Clustering Algorithm

`clusterRssFeedItem(rss_feed_item_id)` runs after an embedding is created for an item:

1. Fetch item; skip if deleted, locked (`story_locked_at`), or has no embedding
2. If item already has `story_id`, return early (already clustered)
3. Find up to `STORY_CLUSTER_CANDIDATE_LIMIT` candidates by vector distance within the asymmetric time window
4. No candidates → return null (no agent call, item stays standalone)
5. Call the `@story-teller` agent with the item + candidates; agent decides using heuristics
6. Agent says `should_cluster=false` → return null
7. Agent picks candidates that already have a story → assign item to that existing story
8. Agent picks candidates without a story → create new story with agent-provided title, `published_at`, and official item; assign all clustered items

Candidates include items **both with and without existing stories**. An item may be pulled into an existing story (joining its cluster) or form a new story with other standalone items.

### Trigger Sources

`enqueueStoryClustering` is called from three places:

1. **Single-path embedding worker** ([`backend/workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts`](../../workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts)) — immediately after `upsertRssFeedItemEmbedding` writes the embedding vector.
2. **Batch-path save** ([`backend/services/bedrock-embeddings-batch/entities/rss-feed-items.mts`](../bedrock-embeddings-batch/entities/rss-feed-items.mts)) — for each item id returned by `applyRssFeedItemBatchUpdates` after a Bedrock batch result is applied.
3. **Batch-path copy-existing** (same file) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table by `copyExistingRssFeedItemEmbeddings` during batch creation.

All three paths use the same `debounce` dedup key (`story_clustering_${id}`, 60 s TTL), so rapid re-enqueues for the same item coalesce.

### Embedding Retry

The `processStoryClustering` processor mirrors the autotagger's embedding-retry pattern: if `clusterRssFeedItem` returns `null` and `hasRssFeedItemEmbedding` is `false`, the job re-enqueues itself with `embedding_retries + 1` and a 5 s delay, up to a cap of 10 retries. This handles narrow timing gaps where clustering fires before the embedding row is fully visible.

### Race Condition Handling

All assignments use `UPDATE ... WHERE story_id IS NULL AND story_locked_at IS NULL RETURNING id`. If RETURNING is empty, the item was assigned concurrently. The current job terminates; a subsequent run will handle the already-clustered item.

## Configuration

- `STORY_WINDOW_DAYS` env var (default 4, max 14) — forward window from story `published_at`
- `STORY_DISTANCE_THRESHOLD = 0.35` — cosine distance cutoff for candidate search
- `STORY_CLUSTER_CANDIDATE_LIMIT = 5` — max candidates sent to agent per item

## Related

- System: [backend/queues/ai-agents/README.md](../../queues/ai-agents/README.md) — job queue calling `clusterRssFeedItem`
- Agent (clustering): [`backend/agents/story-clustering/`](../../agents/story-clustering/) — LLM clustering + title generation
- Agent (story post): [`backend/agents/story-post/`](../../agents/story-post/) — LLM title + `ai_summary_markdown` generation
- API: [backend/api/v1/stories/README.md](../../api/v1/stories/README.md), [`backend/api/v1/stories/`](../../api/v1/stories/)
- Docs: [docs/requirements/content/stories.md](../../../docs/requirements/content/stories.md)
