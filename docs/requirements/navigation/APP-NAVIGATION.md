# App Navigation

The native app (Swift, macOS-first → iOS/iPad) uses a bottom bar of content verticals, each
with per-vertical sub-options. A top omnisearch covers all entity types. The bottom bar is
customizable (reorder/hide items).

Native implementations of these user-facing flows must be SwiftUI-native. WebView, embedded web,
or open-web fallback is allowed only with an accepted-plan blocker, PR explanation, and follow-up
issue to replace it.

See also: [Mobile Responsiveness](./MOBILE.md) · [Sidebar](./SIDEBAR.md) ·
[Sources & Domains](../content/SOURCES-DOMAINS.md) · [Feed And List Filters](./FEED-LIST-FILTERS.md) ·
[Podcasts](../content/PODCASTS.md) · [News Discussions](../content/NEWS-DISCUSSIONS.md) ·
[Client Intent Parity](./CLIENT-INTENT-PARITY.md) — web/native intent contract

## Overview

The bottom bar contains four content verticals and three secondary sections:

| Icon | Section       | Type                   |
| ---- | ------------- | ---------------------- |
| 📰   | News          | Vertical (sub-options) |
| 🎙    | Podcasts      | Vertical (sub-options) |
| ▶️   | Videos        | Vertical (sub-options) |
| 💬   | Posts         | Vertical (sub-options) |
| 🔔   | Notifications | Secondary              |
| 👥   | Friends       | Secondary              |
| 👤   | Profile       | Secondary              |

All sections are customizable: users can hide or reorder bottom bar items.
Secondary sections (Notifications, Friends, Profile) behave like verticals for ordering and
visibility purposes.

## Verticals and Sub-Options

Each vertical exposes ordered sub-options. Sub-options are data, not separate bottom-bar items.

| Vertical       | Sub-options (ordered)                                          |
| -------------- | -------------------------------------------------------------- |
| News           | My News Feed · All News · Your Sources · All Sources           |
| Podcasts       | Your Episodes · All Episodes · My Podcasts Feed · All Podcasts |
| Videos         | Your Video Feed · All Videos · Your Channels · All Channels    |
| Posts          | My Posts Feed · All Posts                                      |
| Referral Links | My Referral Link Feed · My Referral Links · Referral Programs  |

"My \*" / "Your \*" sub-options require authentication. "All \*" sub-options are available signed out.

## Entity Page → Endpoint Mapping

The table below is the canonical mapping from app page to backend endpoint.
It doubles as the web parity gap catalog — see §Web Parity Gaps.

| Page                              | Endpoint                                             | Key params                     | Auth               | Response convention                       | Cursor            |
| --------------------------------- | ---------------------------------------------------- | ------------------------------ | ------------------ | ----------------------------------------- | ----------------- |
| Your News/Podcast/Video Feed      | `GET /api/v1/feeds/rss_feed_items/any`               | `media_type`, `after`, `limit` | required (current) | normalized sidecar (`rss_feed_items` map) | yes               |
| All News/Podcast/Video Feed       | `GET /api/v1/rss-feed-items`                         | `media_type`, `after`, `limit` | optional           | normalized sidecar (`rss_feed_items` map) | yes               |
| All Sources (news/podcast/video)  | `GET /api/v1/rss-feeds`                              | `feed_type`, `limit`           | optional           | inline (`results` array of full objects)  | no — limit-only ⚠ |
| Your Sources (news/podcast/video) | `GET /api/v1/users/{id}/rss-feeds/following`         | `limit`                        | optional†          | inline (`results` array of full objects)  | no — limit-only ⚠ |
| My Referral Link Feed (Following) | `GET /api/v1/feeds/referral_links/follow_users`      | `after`, `limit`               | required           | inline (`results`, `users` map)           | yes               |
| My Referral Link Feed (Mutual)    | `GET /api/v1/feeds/referral_links/mutual_follows`    | `after`, `limit`               | required           | inline (`results`, `users` map)           | yes               |
| Your Posts                        | `GET /api/v1/feeds/posts/any`                        | `after`, `limit`, `post_types` | required           | normalized sidecar (`posts` map)          | yes               |
| All Posts                         | `GET /api/v1/feeds/posts/all`                        | `after`, `limit`, `post_types` | optional           | normalized sidecar (`posts` map)          | yes               |
| Notifications                     | `GET /api/v1/my/notifications`                       | `after`, `limit`               | required           | normalized sidecar (`notifications` map)  | yes               |
| Friends                           | `GET /api/v1/users/{id}/users/following` etc.        | `limit`                        | optional†          | inline (`results` array)                  | no — limit-only   |
| Profile                           | `GET /api/v1/my/identity` + `GET /api/v1/my/profile` | —                              | required           | inline                                    | —                 |
| My Lists                          | `GET /api/v1/lists`                                  | `after`, `limit`               | required           | normalized sidecar (`lists` map)          | yes               |
| List Items                        | `GET /api/v1/lists/{id}/items`                       | `media_type`, `read`, `after`  | view-gated         | normalized sidecar (`list_items` map)     | yes               |

† userId is the current user's ID; request succeeds for any public user, but a nil userId (signed-out) returns an empty list client-side without hitting the network.

⚠ Source list endpoints are limit-only in the native source-list components. See §Web Parity Gaps → backend issues.

### Personalization Scopes

There are **three distinct "type" concepts** that must not be conflated:

| Concept                                   | Values                                                            | Used in                                          |
| ----------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| Feed path scope (`:feedType` URL segment) | `any`, `all`, `follow_rss_feeds`, `follow_users`, `follow_topics` | `/api/v1/feeds/rss_feed_items/:feedType`         |
| Source `feed_type`                        | `article`, `podcast`, `video`, `mixed`                            | Source listing filter; stored on `rss_feeds` row |
| Item `media_type`                         | `article`, `audio`, `video`                                       | Feed item filter query param                     |

**Critical asymmetry**: a podcast source has `feed_type = 'podcast'` but its items have
`media_type = 'audio'`. Never pass `'podcast'` as the `media_type` query param.

**`any` ≠ global**: the `any` scope returns the union of _your_ follows (users + topics + RSS
feeds). It is NOT a platform-wide firehose. The true global feed is `GET /api/v1/rss-feed-items`
(a separate flat endpoint). See §Web Parity Gaps for the web labeling issue.

## Omnisearch

> **Status:** implemented natively in Swift and .NET using the combined backend endpoint.

Omnisearch is a persistent search bar at the top of the app that searches across all entity types
and shows grouped results (Topics · Posts · News · Domains · Communities).

The native clients use `GET /api/v1/search?q=...&limit=...`, matching the web command-search
client. The endpoint fans out server-side across five verticals and returns a lightweight grouped
payload:

| Group       | Fields                             |
| ----------- | ---------------------------------- |
| Topics      | `id`, `name`, `slug`, `topic_type` |
| Posts       | `id`, `post_type`, `title`         |
| News        | `id`, `url`, `title`, `feed_title` |
| Domains     | `id`, `hostname`                   |
| Communities | `id`, `name`, `slug`, `bookmarked` |

## Bottom Bar Customization

> **Status:** implemented natively in Swift and .NET.

Users can hide or reorder bottom bar items (both verticals and secondary sections). Preferences
are stored durably outside purgeable caches so they survive low-storage purges. Swift writes to
`.applicationSupportDirectory`; .NET writes JSON under MAUI app data.

On iOS, `TabView` caps at 5 tabs before overflow moves items to a "More" drawer. Customization
is especially important on iOS to let users keep their top 5 items visible.

Default order: News · Podcasts · Videos · Posts · Notifications · Friends · Profile.

## Platform Layouts

### macOS and iPad (wide layout)

Three-column `NavigationSplitView`:

1. **Column 1 — sidebar**: bottom bar items (AppSection list).
2. **Column 2 — content**: sub-options for the selected vertical (Your Feed · All · Your Sources ·
   All Sources). Hidden for non-vertical sections (Notifications, Friends, Profile).
3. **Column 3 — detail**: the content view for the selected sub-option.

### iOS and compact (narrow layout)

`TabView` bottom bar. Each vertical tab is a `NavigationStack` that lands directly on the primary
sub-option (Your Feed) with a segmented picker at the top to switch between sub-options. There is
no intermediate "menu" screen.

Non-vertical sections (Notifications, Friends, Profile) also appear as tabs and navigate directly
to their content. Swift and .NET both render Notifications as a native inbox backed by
`GET /api/v1/my/notifications`, with read/unread state and mark-read actions.

## Web Parity Gaps

The following gaps were identified when designing the native navigation. Each has a tracking issue.

| Gap                                                                                    | Tracking issue |
| -------------------------------------------------------------------------------------- | -------------- |
| Web has no first-class "Your Sources" page (buried at `/user/:id/rss-feeds/following`) | #5697 closed   |
| Web has no Videos/YouTube vertical                                                     | #5698 closed   |
| Web "All" feed tab label is misleading (`any` ≠ global)                                | #5699 closed   |
| Backend: no `feed_type` filter or cursor on followed-sources endpoint                  | #5700 closed   |
| Backend: no universal cross-entity search endpoint                                     | #5701 closed   |
| Swift + .NET: customizable bottom bar                                                  | #5702 closed   |
| Swift + .NET: cross-entity omnisearch UI                                               | #5703 closed   |
| Backend: cursor pagination for source list endpoints                                   | #5704 closed   |
| Swift + .NET: follow/unfollow from source cards                                        | #5705 closed   |

## See Also

- [Mobile Responsiveness](./MOBILE.md)
- [Sidebar](./SIDEBAR.md)
- [Sources & Domains](../content/SOURCES-DOMAINS.md)
- [Feed And List Filters](./FEED-LIST-FILTERS.md)
- [Podcasts](../content/PODCASTS.md)
- [News Discussions](../content/NEWS-DISCUSSIONS.md)
- [Native client rules](https://github.com/vouchington/vouchington-clients)
