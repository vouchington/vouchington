# User Feeds

For all user feeds:

- A "related" topic is only applicable if the relation's election's net vote score > 0.
  `upsertEntityRelation` fire-and-forgets the elections vote-stats worker, so production callers
  cannot assume the score is immediately durable. Tests that only need eligible fixture state use
  `relatePostToTopic` from `@voucha/test-helpers`. Tests that assert `follow_topics` eligibility
  after tagging must still poll the uncached feed read with the test helper
  `waitForFollowTopicsFeedPost`; feed indexing is a separate async path from the relation score,
  matching `waitForPostMatchingRelatedTopicIds` on the posts search path.
- Post feeds default to chronological ordering with `sort=new` and also support `sort=hot`,
  which ranks posts by an exponentially decayed vote score with a 3-day half-life.
- RSS feed item feeds remain chronological-only.

See [Feed Architecture: Post Feed Sort Options](../../../docs/overview/architecture/feeds.md#post-feed-sort-options)
for the canonical sort and pagination behavior.

## Pagination

Uses **cursor-based pagination** with opaque base64-encoded cursors following industry standards (GraphQL Relay, GitHub API, Stripe).

**To paginate:**

```typescript
// First page
const page1 = await getPostFeedIds(user, { limit: 25 })

// Next page - use end_cursor from previous response
if (page1.page_info.has_next_page) {
  const page2 = await getPostFeedIds(user, {
    limit: 25,
    after: page1.page_info.end_cursor,
  })
}
```

**Key points:**

- Cursors are **opaque base64 strings** - do not parse or depend on their structure
- Use `after` parameter with `page_info.end_cursor` to get the next page
- Post cursor structure varies by sort: `{ timestamp: number, id: string }` for `sort=new` and
  `{ score: number, id: string }` for `sort=hot` (internally encoded)
- RSS feed item cursors use `{ timestamp: number, id: string }` (internally encoded)
- Always check `page_info.has_next_page` before fetching next page

**Example API usage:**

```
GET /api/v1/feeds/posts/any?sort=new&limit=25
GET /api/v1/feeds/posts/any?sort=new&limit=25&after=<opaque-end-cursor>

GET /api/v1/feeds/posts/any?sort=hot&limit=25
GET /api/v1/feeds/posts/any?sort=hot&limit=25&after=<opaque-end-cursor>

GET /api/v1/feeds/rss_feed_items/any?limit=25
GET /api/v1/feeds/rss_feed_items/any?limit=25&after=<opaque-end-cursor>
```

## Posts

- Filter by post type: discussion, review, article, etc.
  - For comments, only show comments from people you follow.
- Filter by feed type:
  - `follow_users` - posts created by users the current user follows
  - `follow_topics` - posts that have a "related" topic that the current user follow or a review for a topic the current user follows
  - `any` - the default, any of the above
  - `all` - all of the above (e.g. must be a post created by a user the current user follows that has a "related" topic that the current user also follows)
- Filter by minimum net vote score (separate parameters for each source):
  - `min_score_follow_users` - Default -5
  - `min_score_follow_topics` - Default 0
  - Both parameters apply independently when using `any` or `all` feed types
- Hide posts that have a "related" topic that is muted or blocked by the current user
- Hide posts that are muted or blocked by the current user
- Hide reviews a topic that is muted or blocked by the user

## Performance

**JIT overhead:** Feed queries generate 600+ plan nodes due to CTE chains and broadcast/privacy
subqueries. PostgreSQL JIT compilation triggers at these plan sizes and can dominate execution time
(e.g. 1389ms JIT vs 17ms actual for `getPostFeedIds`). JIT is disabled during EXPLAIN ANALYZE
profiling to measure actual query execution.

**Partition fan-out (resolved):** `relation__user__*` tables were previously partitioned (HASH,
now forbidden repo-wide — see
[partitioning-strategy.md](../../../docs/overview/architecture/partitioning-strategy.md)) by
`subject_id`. `buildPrivacyFilter` broadcast checks queried `relation__user__follow__user` by
`object_id`, scanning all 8 hash partitions 5+ times per feed query. These tables now use plain
B-tree indexes and the reverse lookup hits a single index scan. This is why user-subject entity
relation tables stay unpartitioned even though they are structurally eligible — see the
partitioning comment in
[`0000-00-01-entity-relations.mts`](../../data-stores/psql/config-driven/0000-00-01-entity-relations.mts).

## RSS Feed Items

- Filter by Feed Type:
  - `follow_rss_feeds` - RSS Feeds that the current user follows
  - `follow_topics` - RSS Feed Items that have a "category topic" or "related" topic that the user follows
  - `any`
  - `all`
- Filter by minimum net vote score (separate parameters for each source):
  - `min_score_follow_rss_feeds` - Default -5
  - `min_score_follow_topics` - Default 0
  - Both parameters apply independently when using `any` or `all` feed types
- Hide RSS Feed Items that have a "category topic" or "related" topic that is muted or blocked by the current user
- Hide RSS Feed Items that are muted or blocked by the current user
- Hide RSS Feed Items for RSS Feeds that are muted or blocked by the user
- Hide any disabled RSS Feeds
- Filter by `has_related_posts` (`true`/`false`) to show only items with/without linked discussion posts via `post -> related -> url`
- Response includes `related_posts_by_url_id`, `posts`, and `posts_metrics` for rendering discussion links

## Sharing

Post and RSS item shares use UUIDv7-ordered latest-share lookups to enforce the
once-per-day duplicate-share window while preserving index use on share tables.

## Related

- [backend/api/v1/feeds/README.md](../../api/v1/feeds/README.md)
- [backend/services/rss-feeds/README.md](../rss-feeds/README.md)
- [docs/overview/architecture/feeds.md](../../../docs/overview/architecture/feeds.md)
