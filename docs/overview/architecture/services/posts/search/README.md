# Searching Posts

Source entrypoint: [backend/services/posts/search/README.md](../../../../../../backend/services/posts/search/README.md)

## Authentication

`currentUser` should be the first argument of every function.

- All created posts are published immediately (no draft support)
- Deleted posts (`deleted_at IS NOT NULL`) are always hidden
- Privacy/broadcast filtering is applied via `buildPrivacyFilter()`

## Moderation Filtering

Post search relies on the provider-neutral clearance projection:

- **Anonymous users**: See only approved posts
- **Authenticated users**: May see their own uncleared posts, but not other users' uncleared posts
- **Moderation staff**: May see uncleared posts on authorized staff surfaces

Provider facts and evidence remain in the moderation ledger and are never part of search contracts.

## Query Builder

Builds a re-usable query, which can then be passed into either `get-ids.mts` or `get-facets.mts`.

Filter Options:

- `url_id: <UUID>` - filter where there is a `getEntityRelationMetadatum('post', 'related', 'url')` for this post as the subject
- `user_id: <UUID>` - filter by `post.created_by_id`
- `similar_post_id: <UUID>` — find similar posts that are similar to a post based on embeddings
- `similar_topic_id: <UUID>` — find similar posts that are similar to a topic based on embeddings
- `similar_rss_feed_item_id: <UUID>` — find posts that are similar to an RSS feed item based on embeddings
- `related_topic_ids: Array<UUID>` — filter by tagged/category topic relation (AND filter). Used by `categories=` API param.
- `universal_topic_ids: Array<UUID>` — filter by any topic relationship: tagged OR review-rated OR data-point-for (OR per topic, AND across topics). The query unions reverse-indexed topic candidates and groups by post before joining to `posts`, avoiding correlated probes over the post table. Used by `topics=` API param.
- `review_topic_ids: Array<UUID>` — filter by reviews for these topic IDs (AND logic — post must have ratings for all specified topics; **NOTE:** if set, `post_type = 'review'` is implied)
- `data_point_topic_ids: Array<UUID>` — filter data points for these topic IDs (AND logic — post must be a data point for all specified topics; **NOTE:** if set, `post_type = 'data_point'` is implied)
- `text_search_query: <String>` — text search query
- `semantic_search_query: <String>` — semantic search query
- `post_types: Array<PostType>` — filter by post type
- `drafts: Boolean` — no longer supported (all posts are published immediately)
- `public_eligibility_only: Boolean` — internal, set only by MCP `search_posts`: judges every candidate as a signed-out reader even when `currentUser` is set, so an author's private or uncleared posts and an administrator's wider access do not apply. Viewer-keyed parts (`exclude_for_user_id`, the `following_new` join) still follow `currentUser`. With `post_types` including `comment`, a comment is also dropped when any live ancestor is unapproved or a topic recommendation. REST routes never set it. The caller must also check a `similar_post_id` seed itself, because the embedding CTE loads any post's embedding by id. Keep it aligned with `resolveReadableThread` (`backend/tools/mcp-post-access.mts`), as described in [MCP read tools](../../mcp-tools/read-tools.md#privacy).

Internal workflow note:

- `topic_recommendation` is excluded from generic post search by default.
- Dedicated recommendation flows may opt in with `include_topic_recommendations: true`, but `/api/posts` and agent tools must not expose that post type.

Notes:

- If both `text_search_query` and `semantic_search_query` are provided, multiple their vectors for a cross ranking

### Semantic search plan

Semantic filtering (`semantic_search_query` and the `similar_*` options) is a distance-threshold predicate, not a nearest-neighbour scan. The pgvector HNSW index serves only `ORDER BY embedding <=> query LIMIT n`, so this query never uses it and `hnsw.iterative_scan` does not apply. REST `GET /api/v1/posts` and MCP `search_posts` share this one query.

- `sort=relevance` with a semantic query (alone or hybrid) computes the distance for every candidate row and sorts by the ranking score; cost grows with the number of embedded posts that pass the other filters.
- `sort=new`, and `similar_*` requests with either sort, walk `posts.id DESC` and filter on distance until the page fills. `similar_*` requests have no ranking expression, so `sort=relevance` is recency-ordered within the threshold.
- Hybrid requests can also switch to a slower generic plan on a long-lived pooled connection, because the query runs as a named prepared statement.

The plan evidence, the reasoning, and the open candidate-window decision are in the [search-utils plan notes](../../../backend/modules/search-utils/README.md#semantic-post-search-plan).

## Get IDs

The key search feature.
Based on the query, returns:

```json5
{
  results: [
    {
      __entity_type: 'post',
      id: '<Post ID>',
      post_type: '<Post Type>',
    },
  ],
  page_info: {
    has_next_page: true,
    end_cursor: '<base64-encoded-cursor>', // Opaque cursor for next page
    start_cursor: '<base64-encoded-cursor>', // Opaque cursor for first item
  },
}
```

## Pagination

Uses **cursor-based pagination** with opaque base64-encoded cursors following industry standards (GraphQL Relay, GitHub API, Stripe).

**To paginate:**

```typescript
// First page
const page1 = await getPostIds(user, { limit: 25 })

// Next page - use end_cursor from previous response
if (page1.page_info.has_next_page) {
  const page2 = await getPostIds(user, {
    limit: 25,
    after: page1.page_info.end_cursor,
  })
}
```

**Key points:**

- Cursors are **opaque base64 strings** - do not parse or depend on their structure
- Use `after` parameter with `page_info.end_cursor` to get the next page
- Cursor structure varies by sort mode (internally encodes different fields)
- Always check `page_info.has_next_page` before fetching next page

## Sort Options

Extends the Filter Options interface

- `sort: 'new'` - sort by `id DESC` (UUIDv7 encodes creation time)
  - Default when no search query is provided
  - Cursor encodes: `{ id: string }`
- `sort: 'best'` - sort by `election.votes_score_sort DESC`
  - Cursor encodes: `{ score: number, id: string }`
- `sort: 'hot'` - exponential time-decay ranking with a 3-day half-life: `score * 2^(-age_seconds / (3 * 86400))`
  - Balances recency and vote score; used for the trending/hot feed surface
  - Cursor encodes: `{ score: number, id: string }`
- `sort: 'relevance'` - default when text or semantic search applied
  - Cursor encodes: `{ ranking: number, id: string }`

## Get Facets

We'll return counts of the results based on the query.

Response:

```json5
{
  "total_count": <Number>
}
```
