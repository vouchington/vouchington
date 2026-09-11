# Bookmarks Catalog

Authoritative reference for all `/my/<entity>/<listType>` self-routes that surface a user's
bookmark relations in the sidebar.

See [USER-RELATION-MATRIX.md](../users/USER-RELATION-MATRIX.md) for the full relation catalog and
[SIDEBAR.md](../navigation/SIDEBAR.md) for Bookmarks group placement rules. See the
[Client Parity Matrix](../CLIENT-PARITY-MATRIX.md) for the user-facing web, Swift, and .NET
coverage of these routes.

## Posts

| Route                  | Relation   | Shared Component        |
| ---------------------- | ---------- | ----------------------- |
| `/my/posts/saved`      | saved      | `UserPostRelationRoute` |
| `/my/posts/hidden`     | hidden     | `UserPostRelationRoute` |
| `/my/posts/following`  | following  | `UserPostRelationRoute` |
| `/my/posts/subscribed` | subscribed | `UserPostRelationRoute` |

Post bookmark surfaces render page one on the server and append opaque-cursor continuation pages.
Web, Swift, and .NET deduplicate by post ID, allow one continuation request at a time, and preserve
rendered rows for retry after failure. The API applies direct-post visibility before pagination;
see the [cross-surface pagination contract](../../overview/architecture/pagination.md).

## Topics

| Route                                  | Relation                  | Shared Component / Approach        |
| -------------------------------------- | ------------------------- | ---------------------------------- |
| `/my/topics/following`                 | following                 | Inline (`getUserTopicsCollection`) |
| `/my/topics/muted`                     | muted                     | `UserTopicRelationRoute`           |
| `/my/topics/blocked`                   | blocked                   | `UserTopicRelationRoute`           |
| `/my/topics/dismissed-recommendations` | dismissed-recommendations | `UserTopicRelationRoute`           |
| `/my/topics/viewed`                    | viewed                    | Inline (`getUserTopicsCollection`) |

## Web Search

| Route                 | Relation | Shared Component            |
| --------------------- | -------- | --------------------------- |
| `/my/urls/saved`      | saved    | `UserUrlRelationRoute`      |
| `/my/domains/muted`   | muted    | `UserHostnameRelationRoute` |
| `/my/domains/blocked` | blocked  | `UserHostnameRelationRoute` |

## Communities

| Route                             | Relation        | Shared Component             |
| --------------------------------- | --------------- | ---------------------------- |
| `/my/communities/saved`           | saved           | `UserCommunityRelationRoute` |
| `/my/communities/proxy-following` | proxy-following | `UserCommunityRelationRoute` |
| `/my/communities/proxy-muted`     | proxy-muted     | `UserCommunityRelationRoute` |

## Friends / Users

| Route                                  | Relation                  | Shared Component / Approach       |
| -------------------------------------- | ------------------------- | --------------------------------- |
| `/my/users/following`                  | following                 | Inline (`getUserUsersCollection`) |
| `/my/users/followers`                  | followers                 | Inline (`getUserUsersCollection`) |
| `/my/users/subscribed-posts`           | subscribed-posts          | `UserUserRelationRoute`           |
| `/my/users/muted`                      | muted                     | `UserUserRelationRoute`           |
| `/my/users/blocked`                    | blocked                   | `UserUserRelationRoute`           |
| `/my/friend-recommendations/dismissed` | dismissed-recommendations | `UserUserRelationRoute`           |

Note: `/my/users/dismissed-recommendations` redirects to `/my/friend-recommendations/dismissed`.

## News

Backed by `rss_feed_items.media_type = 'article'` and `rss_feeds.feed_type = 'article'`.

| Route                     | Entity   | Relation | Shared Component              |
| ------------------------- | -------- | -------- | ----------------------------- |
| `/my/news-items/saved`    | RSS item | saved    | `UserSavedRssFeedItemsRoute`  |
| `/my/news-items/hidden`   | RSS item | hidden   | `UserHiddenRssFeedItemsRoute` |
| `/my/news-items/viewed`   | RSS item | viewed   | `UserViewedRssFeedItemsRoute` |
| `/my/news-sources/muted`  | RSS feed | muted    | `UserRssFeedRelationRoute`    |
| `/my/news-sources/viewed` | RSS feed | viewed   | `UserViewedRssFeedRoute`      |

## Podcasts

Backed by `rss_feed_items.media_type = 'audio'` and `rss_feeds.feed_type = 'podcast'`.

| Route                         | Entity   | Relation | Shared Component              |
| ----------------------------- | -------- | -------- | ----------------------------- |
| `/my/podcast-episodes/saved`  | RSS item | saved    | `UserSavedRssFeedItemsRoute`  |
| `/my/podcast-episodes/hidden` | RSS item | hidden   | `UserHiddenRssFeedItemsRoute` |
| `/my/podcast-episodes/viewed` | RSS item | viewed   | `UserViewedRssFeedItemsRoute` |
| `/my/podcasts/muted`          | RSS feed | muted    | `UserRssFeedRelationRoute`    |
| `/my/podcasts/viewed`         | RSS feed | viewed   | `UserViewedRssFeedRoute`      |

## Videos

Backed by `rss_feed_items.media_type = 'video'` and `rss_feeds.feed_type = 'video'`.

| Route                 | Entity   | Relation | Shared Component              |
| --------------------- | -------- | -------- | ----------------------------- |
| `/my/videos/saved`    | RSS item | saved    | `UserSavedRssFeedItemsRoute`  |
| `/my/videos/hidden`   | RSS item | hidden   | `UserHiddenRssFeedItemsRoute` |
| `/my/videos/viewed`   | RSS item | viewed   | `UserViewedRssFeedItemsRoute` |
| `/my/channels/muted`  | RSS feed | muted    | `UserRssFeedRelationRoute`    |
| `/my/channels/viewed` | RSS feed | viewed   | `UserViewedRssFeedRoute`      |

The item pages include a `RssBookmarkTypeFilter` client component that navigates between the
News/Podcasts/Videos siblings while preserving the `listType` segment (saved/hidden/viewed).
The backend `media_type` query param (`getUserRssFeedItemsCollection`) filters items by type.
Saved and hidden lists apply that filter in SQL before `LIMIT`. Viewed lists read the remaining
recently-viewed Valkey ZSET (capped at 1000; the ZSET has no media_type dimension), probe
`rss_feed_items` for matching ids, then paginate those matches so page 1 is dense. Viewed RSS
**feeds** with `feed_type` use the same remaining-ZSET + Postgres filter + paginate-matches shape
(`getUserRssFeedsCollection`); unfiltered viewed feeds stay a single terminal page of `limit`.

Native parity note: the native bookmark catalog uses the same underlying collections, including
the News/Podcasts/Videos aliases that map to `rss-feed-items` and `rss-feeds` with
`media_type` or `feed_type` filters. Keep fixture coverage aligned with those alias routes as
well as the canonical `/my/<entity>/<listType>` entries above.

Saved-post continuation is covered by the shared private-post lifecycle scenarios. Backend coverage
proves visibility filtering occurs before the limit and scoped cursors have no gaps or duplicates;
the authenticated browser claim proves a 100-row first page can continue to the remaining visible
row and remove one loaded item without removing its sibling.

## Native Collection Contract

Swift and .NET render bookmark collections as typed rows with canonical entity destinations, not
raw identifier labels. A row tap navigates to that destination, while a separate trailing action
removes the mutable relation that defines the collection. The action removes the row optimistically,
guards duplicate taps, and restores the row at its prior rank if the API request fails. Mutation
errors are presented independently from collection-load errors, and a response from a stale route
context must not alter the current collection.

The trailing inverse action applies to the mutable relation already represented by the route,
including saved, hidden, following, subscribed, muted, blocked, dismissed recommendation, and
community proxy relations. Followers and viewed collections are passive history views, so their
rows remain navigable without a removal control. A saved comment resolves and caches its root post
only when the user opens the row, preserving native comment-thread routing without eagerly fetching
every root.

Canonical `/news?rss_item=<uuid>`, `/podcast-episodes?rss_item=<uuid>`, and
`/videos?rss_item=<uuid>` destinations open a focused native RSS item detail. The detail is backed
by `GET /api/v1/rss-feed-items/:id` and includes the full item, election, bookmark state, thumbnail,
playback when supported, and external-source link. The corresponding route without `rss_item`
continues to show the normal feed.

## Design Principles

- Pages render **in-place** at `/my/<entity>/<listType>` — never redirect to
  `/user/<me>/...` — so the correct sidebar intent is preserved.
- All Bookmarks routes require authentication; unauthenticated visitors are redirected to
  `/login?next=<route>`.
- The sidebar Bookmarks group (`dataPw: 'sidebar-group-bookmarks'`) is config-driven in
  `web/lib/navigation/intents/` and is automatically included in the Cmd+K palette.
