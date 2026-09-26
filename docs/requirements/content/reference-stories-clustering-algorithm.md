# Stories reference

[Back to Stories](stories.md)

## Clustering Algorithm

The story-clustering **Choice classifier** decides how each RSS feed item clusters, triggered after each item's embedding is written, regardless of which pipeline delivers it. Unlike the retired freeform-LLM `@story-teller` agent this replaced, it makes exactly one structured decision per job — a fixed choice among a small set of concrete candidates plus an unbound "none" option — never an open-ended judgment call.

1. After embedding, a `story_clustering` job is enqueued with a fresh `batch_id` (a UUIDv7, minted once at enqueue time and preserved across the embedding-retry re-enqueue — see [Trigger Sources](#trigger-sources)).
2. If the item is already in a story, no decision is made at all: the (idempotent) side effects of the prior decision are simply replayed.
3. Otherwise, the job finds up to 5 candidate similar items using pgvector's HNSW index (`<=>` cosine distance operator), deduped so at most one representative per existing story is offered (see [Candidates Include Items Already in Stories](#candidates-include-items-already-in-stories)).
4. If 0 candidates remain, no classifier call is made — the item is left unclustered (equivalent to a `none` decision).
5. Otherwise the classifier is dispatched once against `batch_id`: it checks first for an already-committed decision under that `batch_id` (a retry after a crash mid-side-effect replays the same decision rather than re-deciding), then makes a single Choice call binding each deduped candidate plus an unbound `none` criterion.
6. The bound candidate (if any) whose own probability clears its own effective lower threshold (seeded at 0.65) wins; ties break on a deterministic candidate key. At most one candidate can clear given the seeded threshold and candidate cap — see [What Happens When Candidates Span Multiple Stories](#what-happens-when-candidates-span-multiple-stories).
7. The outcome is one of:
   - **`none`** — no clustering action
   - **`existing_story`** — the incoming item is atomically joined to the winning candidate's story
   - **`standalone`** — a brand-new story is created from exactly the incoming item and the winning standalone item, atomically claiming both or neither

A new story's `title` and `published_at` are derived deterministically, never LLM-generated — see [Story `published_at`](#story-published_at). The classifier never sets a story's official item; that is admin-only — see [Official Items](#official-items).

See [`backend/agents/story-clustering/README.md`](../../../backend/agents/story-clustering/README.md) for the classifier's internals and [`backend/services/stories/README.md`](../../../backend/services/stories/README.md) for the dispatch/join/pair-creation code.

### Trigger Sources

A `story_clustering` job is enqueued from three places — all use the same debounce dedup key (`story_clustering_${id}`, 60 s TTL) so rapid re-enqueues coalesce:

1. **Single-path worker** — immediately after `upsertRssFeedItemEmbedding` writes the vector (real-time pipeline).
2. **Batch-path save** (`applyRssFeedItemBatchUpdates`) — for each item updated when a Bedrock batch API result is applied.
3. **Batch-path copy-existing** (`copyExistingRssFeedItemEmbeddings`) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table.

If clustering fires before the embedding row is visible (narrow timing gap), the processor re-enqueues with a 5 s delay, up to 10 retries — mirroring the autotagger retry pattern — preserving the same `batch_id` across every retry so the eventual dispatch replays the already-committed decision instead of dispatching a new one.

### Parameters

| Parameter                          | Default | Env var             | Description                                                                                                                                                                                       |
| ---------------------------------- | ------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distance cutoff                    | 0.35    | —                   | Cosine distance threshold for candidate search                                                                                                                                                    |
| Time window                        | 4 days  | `STORY_WINDOW_DAYS` | Forward from story `published_at`. Max 14.                                                                                                                                                        |
| Candidate limit                    | 5       | —                   | Max candidates offered to the classifier as bound criteria                                                                                                                                        |
| Choice clear probability threshold | 0.65    | —                   | Seeded per-candidate `effective_lower_threshold` a bound candidate's own probability must clear to win (`0730-00-02-seed-story-clustering-classifier.mts`); classifier-configured, not an env var |
| Clustering source eligibility      | —       | —                   | Items are excluded from clustering when ALL of their source feeds are not discoverable                                                                                                            |

### Clustering Source Eligibility

Items are excluded from clustering when all of their source feeds are not discoverable. Current RSS feed discoverability is read from `view_rss_feed_current_states`, which derives the latest row per feed from `rss_feed_discoverability_changes`.

The `rss-feed-discoverability` worker evaluates topic score, follow count, and publisher type. Publisher types `aggregator` and `forum` are forced undiscoverable.

The multi-source rule applies: if even one source feed is discoverable, the item is eligible for clustering. Undiscoverable-only items are also excluded from the candidate pool for other items' clustering runs.

### Time Window

The time window is **forward from the story's `published_at`**: new items can join a story only if `item.published_at` is between `story.published_at` and `story.published_at + STORY_WINDOW_DAYS`. This gives stories a natural end date.

For initial candidate search (when no story exists yet), the window is symmetric (±N days).

### Candidates Include Items Already in Stories

The candidate search returns items **both with and without existing stories**. This allows a new item to join an existing story rather than always creating a new one. Before dispatch, candidates belonging to the same existing story are deduped to a single representative — the nearest, since results are already distance-ascending (`agents/story-clustering/dedupe-candidates.mts`). This is required, not just an optimization: the Choice classifier binds one criterion per candidate _entity_, and two criteria naming the same story would be rejected as duplicate candidates. Standalone candidates (no story) are never deduped against one another.

### What Happens When Candidates Span Multiple Stories

If the up to 5 nearest neighbors span multiple existing stories, each distinct story is deduped to one candidate before dispatch, so the classifier is offered at most one bound criterion per story alongside any standalone candidates, plus the unbound `none` option. It makes a single Choice decision across all of them: at most one candidate can ever clear the seeded 0.65 probability threshold, because two probabilities ≥ 0.65 would already exceed a Choice answer's total probability mass across its criteria. There is therefore no ambiguous multi-winner case for the code to resolve after the fact — the old per-decision agent's closest-distance fallback for a still-ambiguous multi-story response no longer applies, because the outcome is structurally single-valued (`agents/story-clustering/choice-clustering-selection.mts`).

Items with `story_locked_at` are excluded from the candidate search entirely, so admin-locked stories are never affected by auto-clustering.

### Race Condition Handling

Two atomic-claim mechanisms cover the two outcomes that mutate `rss_feed_items.story_id`:

- **Joining an existing story** (`services/stories/cluster-join.mts`): the incoming item's row is locked (`SELECT ... FOR UPDATE`), re-checked for `story_id IS NULL AND story_locked_at IS NULL`, then claimed via `UPDATE ... WHERE story_id IS NULL RETURNING id`. An empty `RETURNING` means a concurrent operation already claimed the item first, and the job takes no further action.
- **Creating a new story from a pair** (`services/stories/cluster-create-pair.mts`): both the incoming item and the classifier-selected standalone item are locked together in one `SELECT ... FOR UPDATE`, ordered by id (so two pair-creations racing on the same two items in reverse order can't deadlock), and re-checked. The new story row is created from that locked read's metadata, then a single `UPDATE ... WHERE story_id IS NULL RETURNING id` must return **both** ids, or the whole transaction — including the just-inserted story row — rolls back with `StoryRaceConditionError`. This closes a bug in the old per-decision agent's combined-story creation, which locked every candidate row up front but only ever checked the _incoming_ item's own claim result, silently dropping a candidate claimed by a concurrent operation from the new story instead of aborting the whole attempt.

Either race loss is indistinguishable from "no clustering action" to the caller (`clusterRssFeedItem` returns `null`); a subsequent job run correctly handles the already-clustered item.

## Story `published_at`

Each story has a `published_at` timestamp representing when the event actually occurred. It is set once, at story creation, by `deriveNewStoryMetadata` (`agents/story-clustering/story-metadata.mts`) — deterministically the earlier of the incoming item's and the selected standalone item's own `published_at`, never LLM-generated. It is distinct from `created_at` (when the story row was created).

## Official Items

Each story can have one "official" item — the canonical source (e.g., a company's press release). Setting it is **admin-only**; the clustering classifier never sets or changes a story's official item.

- Admins can manually set the official item via `PUT /api/v1/stories/:storyId/official`
- This sets `official_locked_at`

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
