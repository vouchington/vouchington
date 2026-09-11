# User Profile Tab Matrix

Public profile page at `/user/:idOrUsername` — shows only what the person has created or chosen to follow/join.

## Intent

Profile pages live in the **Users & Friends** intent (`friends`), not the CRM intent.
(`web/lib/navigation/intents/resolver.ts`: `['/user/', 'friends']`)

## Tab × Sub-view × Route × Data-source × Access × Visibility

All tabs are **public**. Each collection tab/sub-view **hides when its count is 0** unless the viewer
is currently on that route (existing `appendCountTab` rule). Overview is always available.
Per-owner privacy settings are enforced server-side: a denied viewer gets a viewer-filtered
`count.*` value of 0, so a non-selected tab disappears. A selected deep-linked tab may remain
visible to preserve route context, but its collection request still returns 404.

| Tab             | Sub-views                           | Route(s)                                                                               | Data source                                      | Collection / access      | Visibility field                              | Viewer-filtered count metric                      |
| --------------- | ----------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------ | --------------------------------------------- | ------------------------------------------------- |
| **Overview**    | None                                | `/user/:id` (exact)                                                                    | Profile, bio, links, and client-specific root UI | Public                   | None                                          | None                                              |
| **Posts**       | All, Reviews, Discussions, Comments | `/user/:id/posts`¹, `/user/:id/reviews`, `/user/:id/discussions`, `/user/:id/comments` | `GET /api/v1/posts?creator=:id`                  | Authored content, public | Post row-level privacy                        | `count.reviews + discussions + comments`          |
| **Topics**      | None                                | `/user/:id/topics/following`                                                           | `topics-following` collection                    | `access: 'public'`       | `topic_follows_visibility`                    | `count.topics_following`                          |
| **Friends**     | Following, Followers                | `/user/:id/users/following`, `/user/:id/users/followers`                               | `users-following` / `users-followers`            | `access: 'public'`       | `follows_visibility` / `followers_visibility` | `count.users_following` / `count.users_followers` |
| **Sources**     | All, News, Podcasts, Videos         | `/user/:id/rss-feeds/following` with optional `feed_type`                              | `rss-following` with `feed_type` filter          | `access: 'public'`       | `rss_feed_follows_visibility`                 | `count.rss_feeds_following`                       |
| **Communities** | None                                | `/user/:id/communities/member`                                                         | `communities-member` collection                  | `access: 'public'`       | `community_memberships_visibility`            | `count.communities_member`                        |

¹ The **Posts > All** sub-view is a new route (`/user/:id/posts`) that renders all authored post
types together. Discussions/Reviews/Comments sub-views use their existing routes.

### Sources feed_type mapping

`feed_type` values (from `web/lib/navigation/intents/feed-type-nav.ts`):

| Sub-view | feed_type param | Intent                   |
| -------- | --------------- | ------------------------ |
| News     | `article`       | news                     |
| Podcasts | `podcast`       | podcasts                 |
| Videos   | `video`         | videos                   |
| All      | _(omitted)_     | includes `mixed` as well |

### Navigation presentation

Tabs with sub-views (**Posts**, **Friends**, **Sources**) render as `EntityMenubarNav` items with
`dropdownItems` on web. Native clients render **Overview**, **Posts**, **Topics**, **Friends**,
**Sources**, and **Communities** as primary tabs, then render contextual second-level tabs for the
selected primary tab. Unknown subpaths and unsupported `feed_type` values are rejected instead of
falling back to All.

Profile identity and the actions allowed for the current viewer remain visible on every scope,
including during empty, loading, error, retry, and load-more states. Swift's public header also
keeps the bio, links, and counts visible; .NET preserves its existing root-only bio and links.
Signed-out viewers receive a sign-in handoff from Follow and do not see mute, block, or report.
Self profiles hide all four actions.

Every explicit collection route supports cursor-based continuation. Clients must pass the opaque
`page_info.end_cursor` back as `after`, preserve existing rows on append failure, and suppress
duplicate rows or concurrent load-more requests.

## Removed from the Profile / Relocated to `/my/*`

The following were previously accessible on the profile page but belong only in owner dashboards.

| Removed tab / sub-view                                              | Relocated to                                     |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| Activity (reviews/discussions/comments as a separate top-level tab) | Folds into **Posts** (same routes, new dropdown) |
| Links tab                                                           | `/my/urls`                                       |
| Domains tab                                                         | `/my/domains`                                    |
| Posts > Saved                                                       | `/my/posts/saved`                                |
| Posts > Hidden                                                      | `/my/posts/hidden`                               |
| Posts > Following                                                   | `/my/posts/following`                            |
| Posts > Subscribed                                                  | `/my/posts/subscribed`                           |
| Topics > Muted                                                      | `/my/topics/muted`                               |
| Topics > Blocked                                                    | `/my/topics/blocked`                             |
| Topics > Subscribed News                                            | `/my/topics/subscribed-news`                     |
| Topics > Subscribed Posts                                           | `/my/topics/subscribed-posts`                    |
| Topics > Dismissed Recommendations                                  | `/my/topics/dismissed-recommendations`           |
| Topics > Recently Viewed                                            | `/my/topics/viewed`                              |
| Users > Muted                                                       | `/my/users/muted`                                |
| Users > Blocked                                                     | `/my/users/blocked`                              |
| Users > Subscribed Posts                                            | `/my/users/subscribed-posts`                     |
| Users > Dismissed Recommendations                                   | `/my/users/dismissed-recommendations`            |
| Sources > Muted Feeds                                               | `/my/rss-feeds/muted`                            |
| Sources > Subscribed Feeds                                          | `/my/rss-feeds/subscribed`                       |
| RSS Feed Items > Saved / Hidden / Viewed                            | `/my/rss-feed-items/{saved,hidden,viewed}`       |
| Communities > Saved                                                 | `/my/communities/saved`                          |
| Communities > Proxy Following                                       | `/my/communities/proxy-following`                |
| Communities > Proxy Muted                                           | `/my/communities/proxy-muted`                    |

All `/user/:id/*` owner-private routes redirect `301 → /my/*` equivalents.

## Backend: Communities member-of

The `communities-member` collection is implemented as follows:

- **Collection**: `ts-shared/user-profile-collections/collections/communities.mts` —
  `communities-member`, `routeSegment: 'communities'`, `routeListType: 'member'`,
  `serviceListType: 'member'`, `access: 'public'`, `visibilityField: 'community_memberships_visibility'`,
  `metricGroup: 'count'`, `metricKey: 'communities_member'`
- **Service function**: `listUserMemberCommunities(targetUserId, currentUser, pagination)` in
  `backend/services/communities/members/member-communities.mts` — applies profile, community, and
  roster visibility in SQL before `LIMIT + 1`, then paginates by ascending UUIDv7 membership ID
- **Metrics**: `count.communities_member` added to `UserMetrics` and computed in
  `backend/services/users/metrics.mts` — privacy-filtered so denied viewers see 0
- **API**: `GET /api/v1/users/:idOrSlug/communities/member` — accepts `limit` and the opaque `after`
  cursor from `page_info.end_cursor`; `access: 'public'` remains enforced through `routeConfig`

`topics/following` likewise supports cursor pagination, using descending relation timestamp plus
topic UUID so native clients can append stable pages.

The Topics, Friends, Sources, and Communities lists server-render their first cursor page, then
append subsequent pages through the shared hybrid continuation control. The control remains
manually available as **Load more** while also continuing automatically on scroll. Topic-follow
and membership cursors are scoped to the profile and collection; RSS-feed filters remain attached
to every continuation request.

## Visibility model

Privacy is enforced server-side. For each tab's public collection:

1. The API calls `resolveTargetUser(ctx, { privateCollection: false, visibilityField: ... })`
2. `resolveTargetUser` calls `currentUserCanViewUserContent(viewer, targetUserId, audience)` with
   the owner's `{field}_visibility` setting
3. If the viewer is denied, the API returns `404 User not found`
4. Each collection's viewer-filtered `count.*` metric uses the same audience check: a denied viewer gets `0`
5. Count = 0 → tab/sub-view hidden in the frontend (existing `appendCountTab` rule)

This means privacy is enforced at both the list level (returns 404) and the navigation level
(hides non-selected tabs). A selected deep-linked tab remains visible for route continuity even
when its collection fetch returns 404.

## See Also

- Navigation intent vocabulary: [NAVIGATION.md](../navigation/NAVIGATION.md)
- Entity × action matrix: [ENTITY-ACTION-MATRIX.md](../ENTITY-ACTION-MATRIX.md)
- Entity × lifecycle matrix: [ENTITY-LIFECYCLE-MATRIX.md](../ENTITY-LIFECYCLE-MATRIX.md)
- RSS feed type → intent mapping: `web/lib/navigation/intents/feed-type-nav.ts`
- Collection framework: `ts-shared/user-profile-collections/`
- Profile collection API routes: `backend/api/v1/users/collections.mts`
