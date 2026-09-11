# Comments

Comments are a type of post. However, the differences are primarily on how they are queried.
This is very similar to [Posts Search](../posts/search/README.md)

Only published posts are returned from descendants and ancestors.
Posts cannot be unpublished.

Deleted comments are always returned because doing otherwise would destroy the descendant tree.
However, deleted comments should have all relevant information scrubbed (e.g. no `markdown`, `created_by`, `created_by_id`, `updated_by`, `updated_by_id`, or `election` should be returned to the client)

Drafts (unpublished posts) are never returned by querying the post descendants and ancestors.
Drafts will be queried by a separate query.

Descendants and Ancestors should only return `id`, `post_type`, `parent_id`, `root_id`, `deleted_at`, and `community_id` similar to [Posts Search](../posts/search/README.md).
The comment content themselves will be fetched by the caller via `getPostByAnyCachedBatch`, which does not return data for deleted posts.

Tree/subtree traversal logic also belongs here. API routes should not rebuild comment graphs or BFS
queues inline.

## Community Scoping

Comments inherit `posts.community_id` from their parent/root. Top-level comments on global posts are
global; comments on community posts are community-scoped. Comments no longer choose or filter by a
community independently of the post they are replying to.

Cross-post discussions from global posts into communities also use `parent_id`, so descendant
queries explicitly filter to `post_type='comment'`.

## Querying the Post Descendants

Embedding-based filters are not supported here as they are not needed.
You can still query comments via [Posts Search](../posts/search/README.md).

### Query Builder:

Filter Options;

- `root_id: <UUID>` - the root post or comment to build the descendants from
- `max_depth: Number` - the max depth of comments to return

### Pagination

Uses **cursor-based pagination** with opaque base64-encoded cursors following industry standards (GraphQL Relay, GitHub API, Stripe).

**To paginate:**

```typescript
// First page
const page1 = await getCommentTree(rootId, { sort: 'new', limit: 25 })

// Next page - use end_cursor from previous response
if (page1.page_info.has_next_page) {
  const page2 = await getCommentTree(rootId, {
    sort: 'new',
    limit: 25,
    after: page1.page_info.end_cursor,
  })
}
```

**Key points:**

- Cursors are **opaque base64 strings** - do not parse or depend on their structure
- Use `after` parameter with `page_info.end_cursor` to get the next page
- Always check `page_info.has_next_page` before fetching next page

### Sort Options:

Similar to searching posts:

- `sort: 'best'` - sort by `election.votes_score_sort DESC`
  - Cursor encodes: `{ score: number, id: string }`
- `sort: 'new'` - sort by `published_at DESC`
  - Cursor encodes: `{ id: string }`

## Querying Ancestors

Used for comment permalink pages. Comment creation is not capped: this endpoint only bounds how
many ancestors a permalink view reads at once.

### Bounded permalink windows

`GET /api/v1/posts/:idOrSlug/ancestors?limit=5` reads at most five parent hops at a time. The
maximum is five; clients cannot increase it. `after` without an explicit `limit` uses five. The initial bounded result
is `[root, nearest-parent-window…, target]`, ordered rootward to target, so it contains the root,
up to five nearest parents, and the target. Every continuation keeps the true root pinned and
returns the next five comments toward it. Consequently the root is intentionally repeated between
pages; no comment is repeated.

Traversal itself runs from the target toward the root. Thus `page_info.start_cursor` identifies the
deepest non-root item in a displayed page, while `end_cursor` identifies the shallowest one and is
the only cursor valid for fetching the next rootward window. `has_next_page` is true exactly when
an omitted non-root ancestor remains. Cursors are signed and scoped to the target and root; treat
them as opaque, and always send `after=page_info.end_cursor` unchanged.

During the API expansion window, a request with neither `limit` nor `after` retains the old full
chain response for deployed clients. New clients must opt in with `limit=5`; the compatibility path
must be removed after all clients are migrated, so a no-query request also becomes bounded. This
exception does not authorize an unbounded caller-controlled limit.

## Related

- [docs/requirements/content/COMMENTS.md](../../../docs/requirements/content/COMMENTS.md)
- [Posts Search](../posts/search/README.md)
