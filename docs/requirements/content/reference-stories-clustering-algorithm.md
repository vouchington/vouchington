# Stories reference

[Back to Stories](stories.md)

## Clustering Algorithm

Agent-driven clustering triggered after each RSS feed item embedding is written, regardless of which pipeline delivers it:

1. After embedding, a `story_clustering` job is enqueued
2. The job finds up to 5 candidate similar items using pgvector's HNSW index (`<=>` cosine distance operator)
3. If 0 candidates are found, no agent call is made — the item remains standalone
4. If candidates exist, the `@story-teller` agent (LLM) decides whether to cluster using heuristics:
   - Only groups articles about the **same specific event** (not just the same topic)
   - Rumors, leaks, and speculation are **not** the same story as official announcements
   - Product reviews are **not** the same story as product launches
   - Follow-up developments can be the same story if they reference the same event
5. If the agent decides to cluster, it also provides: title, `published_at` (event date), and the official source article

### Trigger Sources

A `story_clustering` job is enqueued from three places — all use the same debounce dedup key (`story_clustering_${id}`, 60 s TTL) so rapid re-enqueues coalesce:

1. **Single-path worker** — immediately after `upsertRssFeedItemEmbedding` writes the vector (real-time pipeline).
2. **Batch-path save** (`applyRssFeedItemBatchUpdates`) — for each item updated when a Bedrock batch API result is applied.
3. **Batch-path copy-existing** (`copyExistingRssFeedItemEmbeddings`) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table.

If clustering fires before the embedding row is visible (narrow timing gap), the processor re-enqueues with a 5 s delay, up to 10 retries — mirroring the autotagger retry pattern.

### Parameters

| Parameter                     | Default | Env var             | Description                                                                            |
| ----------------------------- | ------- | ------------------- | -------------------------------------------------------------------------------------- |
| Distance cutoff               | 0.35    | —                   | Cosine distance threshold for candidate search                                         |
| Time window                   | 4 days  | `STORY_WINDOW_DAYS` | Forward from story `published_at`. Max 14.                                             |
| Candidate limit               | 5       | —                   | Max candidates sent to agent (controls LLM token budget)                               |
| Clustering source eligibility | —       | —                   | Items are excluded from clustering when ALL of their source feeds are not discoverable |

### Clustering Source Eligibility

Items are excluded from clustering when all of their source feeds are not discoverable. Current RSS feed discoverability is read from `view_rss_feed_current_states`, which derives the latest row per feed from `rss_feed_discoverability_changes`.

The `rss-feed-discoverability` worker evaluates topic score, follow count, and publisher type. Publisher types `aggregator` and `forum` are forced undiscoverable.

The multi-source rule applies: if even one source feed is discoverable, the item is eligible for clustering. Undiscoverable-only items are also excluded from the candidate pool for other items' clustering runs.

### Time Window

The time window is **forward from the story's `published_at`**: new items can join a story only if `item.published_at` is between `story.published_at` and `story.published_at + STORY_WINDOW_DAYS`. This gives stories a natural end date.

For initial candidate search (when no story exists yet), the window is symmetric (±N days).

### Candidates Include Items Already in Stories

The candidate search returns items **both with and without existing stories**. This allows a new item to join an existing story rather than always creating a new one.

### What Happens When Candidates Span Multiple Stories

If the up to 5 nearest neighbors happen to belong to two different existing stories, the agent is instructed to pick the best single match (or none). The agent's prompt says: _"If candidates belong to different stories, pick the best match (or none)"_.

If the agent returns `cluster_item_ids` that still span multiple stories (e.g. agent error or ambiguous content), the code picks the **closest-distance candidate's story** using `find()` over candidates ordered by distance ascending. The new item joins that story; the other story is unaffected.

Items with `story_locked_at` are excluded from the candidate search entirely, so admin-locked stories are never affected by auto-clustering.

### Race Condition Handling

The clustering uses `UPDATE ... WHERE story_id IS NULL RETURNING id` — if the RETURNING is empty, the item was already assigned by a concurrent job. The current job terminates, and a subsequent job run will correctly handle the already-clustered item.

## Story `published_at`

Each story has a `published_at` timestamp representing when the event actually occurred. This is determined by the `@story-teller` agent (typically the earliest credible report date). It is distinct from `created_at` (when the story row was created).

## Official Items

Each story can have one "official" item — the canonical source (e.g., a company's press release).

**Automatic selection:**

- The `@story-teller` agent picks an official item during clustering based on article content (e.g., prefers primary announcements over coverage)

**Admin override:**

- Admins can manually set the official item via `PUT /api/v1/stories/:storyId/official`
- This sets `official_locked_at`, preventing agents from overriding the choice

## Story Posts

Each story can have one story post. Story posts are a dedicated post type (`post_type='story'`) created by the `@story-teller` system user. Any authenticated user can initiate story post creation.

Story posts differ from regular posts:

- **No user-authored markdown** — story posts have a `markdown` column but it must be empty (enforced by `posts_story_no_markdown` constraint)
- **AI-generated content only** — the `@story-teller` agent generates the `title` and `ai_summary_markdown`
- **`ai_summary_markdown`** — a dedicated column on `posts` for AI-generated summaries, separate from user-authored `markdown`. Agents update this field via `updatePost()` (except `topic_recommendation` posts, which use dedicated workflows).
- **Linked via `post__stories`** — a junction table replaces the old `stories.discussion_post_id` column

Creating a story post from a story:

1. Creates a story post (as the `@story-teller` system user) with generated `title` and `ai_summary_markdown`
2. Inserts a `post__stories` row linking the post to the story (with `initiated_by_id` tracking who triggered creation)
3. Records durable URL-projection work in the same transaction. The visible post returns
   immediately; an IO worker validates active item URLs in 100-row pages and converges all eligible
   `post → related → url` relations asynchronously, including exact pruning after membership changes.
4. Forwards RSS feed item category topics as `post → category → topic` entity relations
5. The post's autotagger agent adds additional topic categories downstream

See [news-story-clusters.md](./news-story-clusters.md) for how users trigger story-post creation from the news feed UI (cluster-level "Discuss the full story" CTA).

## Feed Deduplication

RSS feed items in the same story collapse to one entry in feeds and search results. The primary item shown is the official item (or highest-voted). Other story members are available via `story_member_ids` in the response.

## Admin Management

Admins can manually manage story membership:

- **Add item to story**: `PUT /api/v1/stories/:storyId/items/:itemId` — sets `story_locked_at`
- **Remove item from story**: `DELETE /api/v1/stories/:storyId/items/:itemId` — sets `story_locked_at`
- **Update title**: `PATCH /api/v1/stories/:storyId`
- **Set official item**: `PUT /api/v1/stories/:storyId/official`

Items with `story_locked_at` set are never modified by auto-clustering.
