# Stories reference

[Back to Stories](stories.md)

## Clustering Algorithm

Clustering is a Choice classifier run (`story-clustering-classifier`) on the shared classifier-run
lifecycle, started after each RSS feed item embedding is written, regardless of which pipeline
delivers it:

1. An RSS upsert records a durable run request for the item's content. Once the item's embedding is
   current, the run is dispatched (see Trigger Sources).
2. When the run's receipt is first reserved, up to 5 candidates are chosen using pgvector's HNSW index
   (`<=>` cosine distance operator) and stored with the receipt. Each distinct story among the
   neighbors is one candidate, represented by its nearest member; each standalone neighbor is one
   candidate.
3. If there are 0 candidates, no model call is made and the item remains standalone.
4. If candidates exist, one model call asks a single Choice question: which candidate, if any, covers
   the same specific event as the incoming item. The prompt's editorial heuristics are:
   - Only groups articles about the **same specific event** (not just the same topic)
   - Rumors, leaks, and speculation are **not** the same story as official announcements
   - Product reviews are **not** the same story as product launches
   - Follow-up developments can be the same story if they reference the same event
5. The item joins a candidate only when that candidate's probability reaches the stored lower
   threshold (seed `0.65`). `none`, a low-confidence answer, and a missing, malformed or partial answer
   all leave the item standalone.

The classifier decides membership only. It does not produce a title, a `published_at` or an official
item; see Story `published_at` and Official Items below. Storage and run lifecycle are described in the
[story clustering classifier](../../overview/architecture/ai-agents/story-clustering/README.md) and
[classifier runs](../../overview/architecture/services/classifier-runs/README.md) pages.

### One Call Per Content Version

A run is identified by `(classifier, item, content SHA-256, configuration SHA-256)`. The candidate set
is captured once with the receipt and is not part of that identity, so a changed neighbor set, a retry,
lease expiry or a replay never creates a second receipt or a second model call. Unchanged content under
an unchanged prompt, model and actor is never re-classified, and one item version costs at most one
model call however many candidates the search finds.

### Trigger Sources

The run request is written when the RSS item is upserted. The dispatcher is enqueued (best effort, with
the stable job id `classifier_run_dispatcher_story-clustering-classifier_<itemId>`) from three places
once the embedding is current:

1. **Single-path worker** — immediately after `upsertRssFeedItemEmbedding` writes the vector (real-time pipeline).
2. **Batch-path save** (`applyRssFeedItemBatchUpdates`) — for each item updated when a Bedrock batch API result is applied.
3. **Batch-path copy-existing** (`copyExistingRssFeedItemEmbeddings`) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table.

A failed enqueue never fails the embedding job. The `reconcile-classifier-runs` sweep dispatches any
pending request whose item is live at the requested content with a current embedding, so recovery needs
no story-specific marker, retry processor or scheduled job. A dispatcher that runs before the embedding
is current leaves the request pending for the sweep.

### Parameters

| Parameter                     | Default | Env var             | Description                                                                            |
| ----------------------------- | ------- | ------------------- | -------------------------------------------------------------------------------------- |
| Distance cutoff               | 0.35    | —                   | Cosine distance threshold for candidate search                                         |
| Time window                   | 4 days  | `STORY_WINDOW_DAYS` | Forward from story `published_at`. Max 14.                                             |
| Candidate limit               | 5       | —                   | Max candidates in the one question (controls model token budget)                       |
| Join threshold                | 0.65    | —                   | Lower threshold of the active prompt version; a candidate must reach it to be joined   |
| Clustering source eligibility | —       | —                   | Items are excluded from clustering when ALL of their source feeds are not discoverable |

### Clustering Source Eligibility

Items are excluded from clustering when all of their source feeds are not discoverable. Current RSS feed discoverability is read from `view_rss_feed_current_states`, which derives the latest row per feed from `rss_feed_setting_changes`.

The `rss-feed-discoverability` worker evaluates topic score, follow count, and publisher type. Publisher types `aggregator` and `forum` are forced undiscoverable.

The multi-source rule applies: if even one source feed is discoverable, the item is eligible for clustering. Undiscoverable-only items are also excluded from the candidate pool for other items' clustering runs.

### Time Window

The time window is **forward from the story's `published_at`**: new items can join a story only if `item.published_at` is between `story.published_at` and `story.published_at + STORY_WINDOW_DAYS`. This gives stories a natural end date.

For initial candidate search (when no story exists yet), the window is symmetric (±N days).

### Candidates Include Items Already in Stories

The candidate search returns items **both with and without existing stories**. This allows a new item to join an existing story rather than always creating a new one.

### What Happens When Candidates Span Multiple Stories

If the nearest neighbors belong to different existing stories, each story is one candidate and the
question asks for the single best match (or `none`). Because a Choice answer's probabilities sum to 1
and the join threshold is above 0.5, at most one candidate can reach it. If an out-of-band decision
ever had two, the highest probability wins, then the smallest candidate key. The other stories are
unaffected.

Items with `story_locked_at` are excluded from the candidate search entirely, so admin-locked stories are never affected by auto-clustering.

### Race Condition Handling

The decision is applied inside the transaction that completes the run, with the incoming and chosen
items re-read under row locks and assigned with
`UPDATE ... WHERE story_id IS NULL AND story_locked_at IS NULL RETURNING id`. An item that left,
was locked or already joined a story is skipped, never joined wrongly. If the chosen standalone item has
meanwhile joined a story, the incoming item joins that story. A new story needs both founding members to
be assigned or neither is.

## Story `published_at`

Each story has a `published_at` timestamp representing when the event actually occurred. When
clustering founds a story from two standalone items it is the earlier of the two members'
`published_at`, and the title is the chosen member's cleaned title (the story stores NULL and readers
fall back to the item's title when it is empty). `cluster_reason` is a fixed opaque string that no
reader parses. All three are distinct from `created_at` (when the story row was created).

## Official Items

Each story can have one "official" item — the canonical source (e.g., a company's press release).

**Automatic selection:**

- Clustering is membership-only and never sets the official item, so a clustered story has none
  until an admin sets it. Readers fall back to the highest-voted member.

**Admin override:**

- Admins can manually set the official item via `PUT /api/v1/stories/:storyId/official`
- This sets `official_locked_at`; clustering never writes the official item, so it cannot override the choice

## Story Posts

Each story can have one story post. Story posts are a dedicated post type (`post_type='story'`) created by the `@story-teller` system account, whose live agent gives it the public **AI Agent** author label. Any authenticated user can initiate story post creation.

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

RSS feed items in the same story collapse to one entry in feeds and search results. The primary item shown is the official item (or highest-voted). The response provides `story_member_pages` with a bounded, related-only preview and an opaque continuation cursor. The first direct primary is excluded; shares remain standalone.

## Admin Management

Admins can manually manage story membership:

- **Add item to story**: `PUT /api/v1/stories/:storyId/items/:itemId` — sets `story_locked_at`
- **Remove item from story**: `DELETE /api/v1/stories/:storyId/items/:itemId` — sets `story_locked_at`
- **Update title**: `PATCH /api/v1/stories/:storyId`
- **Set official item**: `PUT /api/v1/stories/:storyId/official`

Items with `story_locked_at` set are never modified by auto-clustering.

REST and the admin MCP story tools share administrator, suspension, target and membership guards.
Each successful add/remove, official-item selection or rename writes the acting staff user's
`story_item_add`, `story_item_remove`, `story_official_item_set` or `story_rename` audit action in
the mutation transaction. Story/item identifiers in these non-joined change-history documents stay JSON.
`get_editorial_story` is the distinct administrative reader and requires the exact editorial read grant.

Moving or removing the selected official article clears the former story's official reference in
that same transaction and retains its administrator lock, matching the FK's deletion behavior.
The official setter locks the article before the story lifecycle lock, so it serializes with
membership changes and cannot select an article that concurrently left the story.
