# Story Clustering Agent

The `@story-teller` agent decides whether RSS feed items belong to the same news story, using heuristic rules to avoid bad groupings. It also generates the story title, determines `published_at`, and picks the official item — all in one LLM call.

## Why One Agent for Everything

Clustering + title + official item selection are done in a single LLM call to avoid multiple round-trips for what is fundamentally one editorial decision: "do these articles cover the same event, and if so, how should it be described?"

## Candidate Selection

Candidates are the up to `STORY_CLUSTER_CANDIDATE_LIMIT` (5) nearest neighbors by cosine distance, within the asymmetric time window. Crucially, **candidates include items that already belong to stories** — not just standalone items. This allows the new item to join an existing story rather than always creating a new one.

The candidate limit exists to control LLM prompt token cost. Five candidates provide enough context for a meaningful editorial decision without inflating the prompt.

`STORY_DISTANCE_THRESHOLD` is `0.35` (cosine distance). This intentionally strict threshold reduces false positives where topically similar but event-distinct articles (e.g., two separate security incidents in the same domain) would otherwise be surfaced as candidates. Items with distance ≥ 0.35 never reach the LLM.

If an item is grouped with candidates that already have a story, it joins that story. If it's grouped with standalone candidates, a new story is created for all of them.

## Rules

- Only group articles about the **same specific event** (not just the same topic)
- Rumors, leaks, and speculation are **not** the same story as official announcements
- Product reviews are **not** the same story as product launches
- Follow-up developments can be the same story if they reference the same event
- Max title length: 100 characters, neutral tone, no publication names
- Always sanitize external content with `sanitizePromptInjection()` + `wrapExternalContent()`
- Respect `official_locked_at` — never override admin's official item selection
- Validate all returned IDs are actual story members

## Inputs

- New RSS feed item (with embedding)
- Up to `STORY_CLUSTER_CANDIDATE_LIMIT` candidate items (from cosine distance search; may include items already in stories)

## Outputs

- `should_cluster`: whether the item belongs with any candidates
- `reason`: brief explanation of why the articles were (or were not) grouped — stored as `cluster_reason` on the `stories` row when a new story is created
- `title`: concise headline for the story
- `published_at`: when the event occurred (earliest credible report date)
- `official_rss_feed_item_id`: the primary/canonical source article

The `cluster_reason` is displayed in the frontend on the `NewsItemCluster` component so users can understand why articles were grouped together.

## Trigger Contract

A `story-clustering` job is enqueued whenever an RSS feed item transitions from "no embedding" to "has embedding", regardless of which path delivered the embedding:

1. **Single-path worker** ([`backend/workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts`](../../workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts)) — immediately after `upsertRssFeedItemEmbedding` writes the embedding vector.
2. **Batch-path save** ([`backend/services/bedrock-embeddings-batch/entities/rss-feed-items.mts`](../../services/bedrock-embeddings-batch/entities/rss-feed-items.mts)) — for each item id returned by `applyRssFeedItemBatchUpdates` after a Bedrock batch result is applied.
3. **Batch-path copy-existing** (same file) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table by `copyExistingRssFeedItemEmbeddings`.

All three paths use the same `debounce` dedup key (`story_clustering_${id}`, 60 s TTL), so rapid re-enqueues coalesce.

## Embedding Retry

`processStoryClustering` mirrors the autotagger's embedding-retry pattern. If `clusterRssFeedItem` returns `null` and `hasRssFeedItemEmbedding` returns `false`, the processor re-enqueues with `embedding_retries + 1` and a 5 s delay, up to a cap of 10 retries. This handles narrow timing gaps where clustering fires before the embedding row is fully visible.

## System User

Uses the `@story-teller` system user (`agent_type = 'storyteller'`), created via `getSystemUserByUsername('story-teller')`.
