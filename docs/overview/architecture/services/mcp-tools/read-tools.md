# Post, Story and Community Read Tools

[Back to MCP Tools service](README.md#structured-tool-results)

`get_post`, `get_post_ancestors`, `get_post_descendants` and `get_story` read a post, its thread and
a news story. Each requires the `posts:read` scope, is read-only, names its REST twin in `meta.api`,
and sits on the `internal` and `mcp` surfaces like the other post tools. `search_posts`
is not one of them but follows their [privacy rule](#privacy). The
[community read tools](#community-read-tools) follow the same shape with the `communities:read`
scope. The hostname, list and user read tools share
this shape and are described in
[Hostname, List and User Read Tools](../../mcp/hostname-list-user-read-tools.md).

- `get_post`: `GET /api/v1/posts/:idOrSlug`; `post_id` (UUID or slug).
- `get_post_ancestors`: `GET /api/v1/posts/:idOrSlug/ancestors`; `post_id` (UUID or slug).
- `get_post_descendants`: `GET /api/v1/posts/:idOrSlug/descendants`; `post_id`, `limit` (1-200), `after`.
- `get_story`: `GET /api/v1/stories/:id`; `story_id`, `limit` (1-25), `after`, `exclude_item_id`.

## Result shape

Each tool owns a closed output schema (`backend/mcp/mcp-post-output.mts`, `mcp-story-output.mts`)
whose fields are picked from the checked-in REST `Post`, `Story`, `ViewRssFeedItem` and `PageInfo`
components, and `post-read-tools.output-schema.test.mts` pins every field to `request-contracts.json`. The
result is `{ success: true, ... }` or `{ success: false, error }`, so expected bad input (a missing
post, a malformed cursor) never surfaces as a tool failure. `after` is the opaque
`page_info.end_cursor` of the previous page, and a malformed one returns `Invalid cursor`.

Post markdown and article markdown are wrapped with `wrapExternalContent`, and titles are sanitized
like the `search_posts` and `search_rss_feed_items` results.

## Privacy

MCP is parity minus private data. `resolveReadableThread` (`backend/mcp/mcp-post-access.mts`)
answers a post as `Post not found` unless every live node of its parent chain passes the shared
`canViewPostsBatch` policy both as the credential owner and as a signed-out reader. A post the owner
sees only through private visibility (a private audience, a private community, or their own
unapproved post) is therefore never returned, even to its author, and a topic recommendation is
never returned. One hidden ancestor hides the whole thread, so a `parent_post_id`, title or count never
reveals it.

`search_posts` applies the same rule to what it returns, so a search never lists a post these tools
would refuse. Its query judges every candidate as a signed-out reader (`public_eligibility_only` in
`backend/services/posts/search/query-builder/base-filters.mts`), even for the author or an
administrator, so private, audience-limited and not-yet-cleared posts are not listed. When
`post_type` includes `comment`, `thread-readability.mts` also drops a comment unless every live
ancestor is approved and not a topic recommendation, the chain rule above. A `similar_post_id` seed
that `get_post` would refuse is answered like an id that matches nothing, an empty page, so its
embedding cannot be probed. The owner's mutes and blocks still remove results.

The inclusion is one-way: a search result is always readable through `get_post`, but a readable
post may not be found by search, which also needs `broadcast = everyone`, an unarchived post, an
unsuspended author and no community. The chain check (JavaScript) and the search filter (SQL) must
stay aligned; `output-schema-contract-search-posts.agreement.test.mts` compares them on shared
fixtures.

`get_post_descendants` pages with the REST descendants page (`getCommentDescendantsPage`), whose
cursors are scoped to the thread and never to a viewer; a hidden reply prunes its subtree. A deleted
post is left out rather than tombstoned, because the `view_posts` read model does not return it, so
a `parent_post_id` can name a post that is not listed. Anonymous posts hide their author from every
caller, including the author.

`get_story` needs no owner-and-signed-out check. Stories are public, and the only viewer-dependent
filters on their articles (`getStoryMemberPagesBatch`) are the owner's own mutes, hides and excluded
hostnames, which only remove articles, so no article is reachable through private visibility.

## Community read tools

Five tools read communities. Each requires the `communities:read` scope (a resource scope covered by
the `mcp.user:read` umbrella), is read-only, and names its REST twin in `meta.api`.

- `search_communities`: `GET /api/v1/communities`; `q`, `sort` (name, members, virtual_subscriptions), `limit`, `after`.
- `get_community`: `GET /api/v1/communities/:idOrSlug`; `community_id` (UUID or slug).
- `get_community_posts`: `GET /api/v1/communities/:idOrSlug/posts`; `community_id`, `sort` (new, hot), `q`, `limit`, `after`.
- `get_community_pinned_posts`: `GET /api/v1/communities/:idOrSlug/pinned-posts`; `community_id`.
- `get_community_members`: `GET /api/v1/communities/:idOrSlug/members`; `community_id`, `role` (owner, moderator, member), `limit`, `after`.

Paged tools take `limit` 1 to 25 (default 20), refuse anything else as invalid params, and return
`page_info` whose `end_cursor` is passed back as `after` with the same sort. The REST routes allow
100 on some of these; the tools keep the signed-out cap of 25. A malformed cursor, or one minted by
another sort, returns `{ success: false, error: "Invalid cursor" }`.

`get_community_posts` returns `pinned_post_ids` instead of hydrated pins, and only on the first
page that has no `q` filter (pinned posts are left out of every unfiltered page, as on REST).
`get_community_pinned_posts` hydrates them in pin order.

### Community privacy

The tools act as a signed-out reader for every caller, so they are parity minus private data. Each
tool resolves its community through `loadCommunityForViewer(null, idOrSlug)`
(`backend/mcp/mcp-community-output.mts`), and a private, deleted or unknown community is
`{ success: false, error: "Community not found" }` for its member, moderator, owner and an
administrator alike. `search_communities` filters to public communities. Posts and pins use the
public post eligibility filter, so a pinned post the public can no longer read is left out, and
`get_community_members` returns the signed-out roster (owners and moderators, plus regular members
only when the roster is public). Anonymous posts hide their author from every caller, including the
author and administrators, and no response carries a viewer sidecar (membership, vote or follow
state).

Community descriptions, rules and post markdown are wrapped with `wrapExternalContent`; titles and
names are sanitized. The shared post-page and hashtag-query logic lives in `@services/communities`
(`getCommunityPostsPage`, `resolveCommunityHashtagQuery`), used by both the REST routes and the
tools, so the two cannot drift.

## RSS and personalized feed read tools

The RSS tools require `rss-feeds:read` or `rss-feed-items:read`; the three personalized feeds use
`feeds:read`. All are read-only, declare `plan: free`, and identify their REST route in `meta.api`.
The domain services decide which rows the caller may see. An RSS feed detail can include a disabled
or non-discoverable feed because its REST detail route does; RSS feed search retains the REST default
enabled filter and optional `apply_mutes` behavior. Item search uses the REST parser and search
service, including its precise timestamp and semantic cursors. RSS item and feed text is sanitized
and fenced as external content. Item cursors include viewer state, so an MCP caller can round-trip
its cursor against signed-in REST as the same user; anonymous REST mints its own cursor.

| REST route                                      | MCP tool                           | Result and limit                                             |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `GET /api/v1/rss-feeds`                         | `search_rss_feeds`                 | Feed summaries, cursor, 25 max                               |
| `GET /api/v1/rss-feeds/:id`                     | `get_rss_feed`                     | Feed summary                                                 |
| `GET /api/v1/rss-feeds/recommended`             | `get_recommended_rss_feeds`        | Personalized IDs, scores, reasons, cursor, 100 max           |
| `GET /api/v1/rss-feeds/trending`                | `get_trending_rss_feeds`           | Public IDs and metrics, cursor, 100 max                      |
| `GET /api/v1/rss-feeds/:id/crawls`              | `list_rss_feed_crawls`             | Paid or administrator summaries, cursor, 100 max             |
| `GET /api/v1/rss-feeds/:id/crawls/:crawlId`     | `get_rss_feed_crawl`               | Paid summary or privileged administrator detail              |
| `GET /api/v1/rss-feed-items`                    | `list_rss_feed_items`              | Item summaries, cursor, 100 max                              |
| `GET /api/v1/rss-feed-items/:id`                | `get_rss_feed_item`                | Item summary and fenced article text                         |
| `GET /api/v1/rss-feed-items/:id/follow-context` | `get_rss_feed_item_follow_context` | Caller-followed voter IDs and counts                         |
| `GET /api/v1/rss-feed-items/:id/votes`          | `get_rss_feed_item_votes`          | Own votes or, for administrators, all votes; cursor, 100 max |
| `GET /api/v1/feeds/rss_feed_items/:feed_type`   | `get_rss_feed_item_feed`           | Caller feed item IDs and delivery types, cursor, 100 max     |
| `GET /api/v1/feeds/posts/:feed_type`            | `get_post_feed`                    | Caller feed post IDs and delivery types, cursor, 100 max     |
| `GET /api/v1/feeds/referral_links/:feed_type`   | `get_referral_link_feed`           | Followed-user referral links, cursor, 100 max                |

The existing `search_rss_feed_items` remains an internal agent tool. Its older search service has
no cursor, so MCP uses `list_rss_feed_items`, which accepts text, semantic and similar-item search
through the REST parser and returns `page_info`. The `get_list_items` description names
`get_rss_feed_item` for RSS entries.

The two crawl tools apply `currentUserCanViewLatestRssFeedCrawl` with the caller's current
membership, exactly as REST does. `get_rss_feed_crawl` uses the same administrator split: paid
callers receive only `RssFeedCrawlSummary`; administrators may receive `feed_data`, sanitized and
fenced as external content. `get_rss_feed_item_follow_context` and the personalized feed tools
read only the credential owner's graph. Votes use the REST service's administrator versus own-vote
query. These tools return compact records, so callers can fetch entity details separately when
needed.

## Administrative actions

Admin tools reuse domain service validation and history paths with explicit actor identity. They are exclusive to `admin_mcp`, require administrator role and their catalogued OAuth scopes, and do not depend on membership plans. Calls enforce the same scope policy used by listing. Expected 4xx failures return a typed `isError` payload with status, code, message, and `retryable: false`; unexpected failures retain the generic error and telemetry path.

The shared admin factory marks user-authored and AI-derived text as untrusted external content and omits credential and verification secrets from both results and schemas. See [scope policy](../../backend/modules/scopes/README.md) and [training evidence](../moderation-training/README.md).

User write tools preserve admission error codes. Concurrent admission returns `retryable: true` with its retry delay; exhausted capacity and key reuse return `retryable: false`.
