# Searching Posts

## Authentication

`currentUser` should be the first argument of every function.

- All created posts are published immediately (no draft support)
- Deleted posts (`deleted_at IS NOT NULL`) are always hidden
- Privacy/broadcast filtering is applied via `buildPrivacyFilter()`

## Moderation Filtering

Posts flagged by OpenAI moderation are filtered from search results based on user permissions:

- **Anonymous users**: Cannot see flagged posts
- **Authenticated users**: Can see their own flagged posts, but not other users' flagged posts
- **Administrators**: Can see all posts, including flagged posts

The filtering only applies to posts where `openai_omni_moderation_created_at IS NOT NULL` (moderation has been completed). Posts without completed moderation are treated as unflagged.

## Query Builder

Builds a re-usable query, which can then be passed into either `get-ids.mts` or `get-facets.mts`.

Filter Options:

- `url_id: <UUID>` - filter where there is a `getEntityRelationMetadatum('post', 'related', 'url')` for this post as the subject
- `user_id: <UUID>` - filter by `post.created_by_id`
- `similar_post_id: <UUID>` — find similar posts that are similar to a post based on embeddings
- `similar_topic_id: <UUID>` — find similar posts that are similar to a topic based on embeddings
- `related_topic_ids: Array<UUID>` — filter by tagged/category topic relation (AND filter). Used by `categories=` API param.
- `universal_topic_ids: Array<UUID>` — filter by any topic relationship: tagged OR review-rated OR data-point-for (OR per topic, AND across topics). The query unions reverse-indexed topic candidates and groups by post before joining to `posts`, avoiding correlated probes over the post table. Used by `topics=` API param.
- `review_topic_ids: Array<UUID>` — filter by reviews for these topic IDs (AND logic — post must have ratings for all specified topics; **NOTE:** if set, `post_type = 'review'` is implied)
- `data_point_topic_ids: Array<UUID>` — filter data points for these topic IDs (AND logic — post must be a data point for all specified topics; **NOTE:** if set, `post_type = 'data_point'` is implied)
- `text_search_query: <String>` — text search query
- `semantic_search_query: <String>` — semantic search query
- `post_types: Array<PostType>` — filter by post type
- `drafts: Boolean` — no longer supported (all posts are published immediately)

Internal workflow note:

- `topic_recommendation` is excluded from generic post search by default.
- Dedicated recommendation flows may opt in with `include_topic_recommendations: true`, but `/api/posts` and agent tools must not expose that post type.

Notes:

- If both `text_search_query` and `semantic_search_query` are provided, multiple their vectors for a cross ranking

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
