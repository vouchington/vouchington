# Posts

Post creation, reviews with topic ratings, search, privacy/broadcast controls, and moderation.

## Overview

The posts service is the core content creation system. It handles multiple post types (discussions, comments, reviews, topic/RSS feed recommendations), enforces broadcast and privacy rules, manages review topic ratings, and provides full-text and semantic search. Posts are always published immediately — there is no draft support.

## Key Files

- `create.mts` — Transactional post creation: validates inputs, inserts post + slug + images + review ratings + community review row, enqueues post-created events
- `create-story-post.mts` — `insertStoryPostRecord()`: INSERT INTO posts for story posts, called from the stories service; accepts `QueryOptions` to participate in transactions
- `get.mts` / `get-batch.mts` — Single and batch post lookups
- `update.mts` — Post updates (title, markdown, broadcast, privacy, images)
- `delete.mts` — Soft deletion
- `types.mts` — `Post`, `PostMetrics`, `PostElection`, `CreatePostInput` types
- `authorization.mts` — `currentUserCanUpdatePost`, `currentUserCanDeletePost` (creator or admin)
- `audience.mts` — Validates broadcast/privacy combinations
- `privacy-filter.mts` — `buildPrivacyFilter()` generates the reusable SQL WHERE fragment for remaining listing queries
- `check-privacy-access.mts` — `canViewPost()` direct-reader gate. It re-resolves the candidate and root from PostgreSQL, so a comment must satisfy its own clearance as well as its root's clearance, audience, community publication, and story-source eligibility.
- `mask-anonymous.mts` — `maskAnonymousPost()` strips author identity from anonymous posts
- `tagging.mts` — `tagPostWithTopics()` batch-tags a post with topic categories via entity relations
- `post-ratings.mts` — Individual CRUD for review topic ratings (add, update, delete)
- `metrics.mts` / `metrics-batch.mts` — Post metrics and election data
- `slugs.mts` — Post slug generation and management
- `content.mts` — Generates content hashes for embeddings and moderation
- `images.mts` — Validates post image inputs
- `post-category-finalizations.mts` — Durable, generation-fenced replay of category-vote finalization after a post mutation commits
- `category-vote-stats.mts` — Primary category-score refresh in atomic bounded chunks, coalescing publication capture per post/chunk. Successful changed chunks publish notification reconciliation; a failed chunk durably queues its full target set, leaving earlier committed chunks' effects intact.
- `review-successions/` — Exact-topic root-review reconciliation, immutable automatic archive epochs, and read-only historical audit

### [`search/`](search/)

- `query-builder.mts` — Composable search query builder with filters (url_id, user_id, similar_post_id, related_topic_ids, universal_topic_ids, review_topic_ids, data_point_topic_ids, text/semantic search)
- `get-ids.mts` — Paginated search returning post IDs with cursor-based pagination
- `get-facets.mts` — Count aggregations for search results
- `types.mts` — Search filter and sort option types

### [`tools/`](tools/)

- Agent tool definitions for LLM post interaction
- `tools/semantic.mts` — `toolsSearchPostsSemantic` ranks posts by embedding distance (HNSW + `applyFilteredVectorScan`). It has no candidate-ID filter; dirty-DB fixture isolation uses `queryPostSemanticFixturesScopedToIds` in test helpers.

## Review Content Validation

Review posts enforce minimum content quality thresholds via `assertValidReviewContent()` in `validate-review-content.mts`:

- `REVIEW_MIN_CHARACTERS = 150`
- `REVIEW_MIN_WORDS = 30`
- `REVIEW_MIN_SENTENCES = 3`

Administrators bypass these checks. Measured against the raw `markdown` field (not `title` or `ai_summary_markdown`). Constants are defined in [`ts-shared/utils/validation.mts`](../../../ts-shared/utils/validation.mts). Validated on both create and update paths when `markdown` is in the changes.

## Post Types

| Type                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `discussion`           | Standard post (default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `comment`              | Reply to another post (requires `parent_id`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `review`               | Review with 1+ topic ratings (multi-topic reviews must not all have identical ratings)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `comparison_review`    | Multi-topic comparison review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `data_point`           | Structured data submission (credit card, bank account)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `story`                | Story post — created by `@story-teller` system user, no user-authored markdown. Records an `approve` clearance change so the initiating user can view it immediately. Title is derived from the single RSS item title (single-item story) or the story title (multi-item); falls back to `'Story'`. `ai_summary_markdown` starts as `''` and is backfilled asynchronously by the `story-post` agent worker (job enqueued after insert); invalid agent JSON or a blank summary fails the job so it can retry instead of publishing placeholder content. `ai_summary_markdown` is restricted to administrators (agents run as system admin users). |
| `topic_recommendation` | Internal workflow — excluded from public surfaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Broadcast & Privacy

- `everyone` + `public`: everyone can discover and directly access the post.
- `users` + `public`: signed-in users can discover it; everyone can directly access it.
- `users` + `private`: signed-in users can discover and directly access it.
- `followers` + `public`: followers can discover it; everyone can directly access it.
- `followers` + `private`: followers can discover and directly access it.
- `mutual_followers` + `public`: mutual followers can discover it; everyone can directly access it.
- `mutual_followers` + `private`: mutual followers can discover and directly access it.

## Direct reader eligibility

Direct API routes authorize the requested candidate, not a substituted root. A comment therefore
cannot inherit publication from an approved root while it is pending or rejected itself. Its root
still controls audience, community publication, and story-source eligibility. Archived posts and
posts by suspended authors remain available by direct link when those checks pass; discovery
surfaces apply their own stricter archive and suspension filters.

## `ai_summary_markdown` Column

The `posts.ai_summary_markdown` column holds AI-generated summary content, separate from user-authored `markdown`. Agents update this field via `updatePost()`. Note that `topic_recommendation` posts use the dedicated recommendation update workflow and cannot be updated via the standard path. Story posts use this field exclusively (no user-authored markdown).

## Architecture Notes

- Post creation is transactional: post, slug, images, ratings, and community review state are committed atomically
- Hashtag, explicit-topic, and data-point topic category mutations atomically persist one coalesced post-category finalization carrying every editing actor, the post owner, and any create-response topic snapshot. The direct replay runs after commit; a serialized five-minute queue recovery drains interrupted finalizations in 25-row pages, reloads the current row after taking the per-post lock, chains full pages, and acknowledges only the matching generation. A generation increments only while its row remains retained; a recreated row starts at generation 1 and is safe because the worker reloads it under that lock. The database repairs a retained create response in the same transaction as every exact-generation acknowledgement; an update atomically clears the create-response marker so recovery never rewrites a response with later category edits.
- Side effects (auto-subscribe, auto-vote, mentions, moderation, fan-out) are handled by entity listener jobs, not inline
- Admin-created posts record an `approve` clearance change and skip automated moderation, moderator-agent dispatch, community moderation, and spam detection on create. They still enqueue mentions, embeddings, autotagger, sitemap, and cache/metrics work. The bypass applies only at creation: a later moderation-affecting edit through `updatePost()` resets clearance and stale moderation status inside the same transaction, then the post-updated listener re-runs the normal moderation path.
- Review ratings use individual CRUD operations — never bulk DELETE + INSERT
- Review succession runs from publication dirty work, not creation; manual archive/unarchive terminalizes only the acted-on automatic epoch.
- Search supports three sort modes: `new` (UUIDv7 ordering), `best` (vote score), `relevance` (text/semantic)
- Moderation-flagged posts are hidden from non-owner, non-admin search results
- Anonymous posts hide author identity for all except the creator and admins

## Related

- Agent invariants: [CLAUDE.md](CLAUDE.md)
- Search details: [search/README.md](./search/README.md)
- API routes: [../../api/v1/posts/README.md](../../api/v1/posts/README.md)
- Entity listeners: [../../queues/entity-listeners/README.md](../../queues/entity-listeners/README.md)
- Embeddings: [../../queues/bedrock-embeddings/README.md](../../queues/bedrock-embeddings/README.md)
- Moderation: [../../queues/openai-moderation/README.md](../../queues/openai-moderation/README.md)
