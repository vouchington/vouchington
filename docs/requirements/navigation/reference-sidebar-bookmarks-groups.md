# Sidebar reference

[Back to Sidebar](SIDEBAR.md)

## Bookmarks Groups

Each non-RSS intent (Posts, Topics, Web Search, Communities, Users & Friends) contains an auth-gated
`Bookmarks` NavGroup that appears after the `Browse` group. The group has `requiresAuth: true`, so
it is hidden entirely for unauthenticated users.

| Intent          | Bookmarks link             | Route                             |
| --------------- | -------------------------- | --------------------------------- |
| Posts           | Saved Posts                | `/my/posts/saved`                 |
|                 | Hidden Posts               | `/my/posts/hidden`                |
|                 | Followed Posts             | `/my/posts/following`             |
|                 | Subscribed to Posts        | `/my/posts/subscribed`            |
| Topics          | Followed Topics            | `/my/topics/following`            |
|                 | Muted Topics               | `/my/topics/muted`                |
|                 | Blocked Topics             | `/my/topics/blocked`              |
|                 | Recently Viewed Topics     | `/my/topics/viewed`               |
|                 | Import/Export              | `/my/topics/import-export`        |
| Web Search      | Saved Links                | `/my/urls/saved`                  |
|                 | Muted Domains              | `/my/domains/muted`               |
|                 | Blocked Domains            | `/my/domains/blocked`             |
| Communities     | Saved Communities          | `/my/communities/saved`           |
|                 | Proxy-Followed Communities | `/my/communities/proxy-following` |
|                 | Proxy-Muted Communities    | `/my/communities/proxy-muted`     |
| Users & Friends | Following                  | `/my/users/following`             |
|                 | Followers                  | `/my/users/followers`             |
|                 | Subscribed to Posts        | `/my/users/subscribed-posts`      |
|                 | Muted                      | `/my/users/muted`                 |
|                 | Blocked                    | `/my/users/blocked`               |

Bookmark pages render in-place at `/my/<entity>/<listType>` (not redirected to
`/user/<me>/...`) so the correct sidebar intent is preserved. The Bookmarks group is also
surfaced in the Cmd+K palette because it is part of the `NAV_INTENTS` config (auth-gated items
are excluded from the palette for unauthenticated users).

### Recommended Topics Aside

The **Recommended Topics** aside is shown on Topics-intent list pages (`/topics`, `/cards`,
`/rewards-programs`, `/rewards-program-statuses`, `/spending-categories`). It is **not** a
sidebar link — it is rendered as a page aside via `RecommendedTopicsAside` (RSC) in
`web/components/topics/topic-list-page.tsx`, scoped with `getActiveIntent` so it does not
appear on `/referral-programs` (which resolves to `referral-links`).

Each row offers **Follow** (optimistic, removes from list) and **Dismiss** (optimistic, removes
from list and records `dismiss_recommendation` bookmark). A footer link
(`data-pw='recommended-topics-aside-dismissed-link'`) navigates to
`/my/topics/dismissed-recommendations`.

The dismissed page is reachable via:

1. The aside footer link (when recommendations exist).
2. Cmd+K search shortcut — `/my/topics/dismissed-recommendations` is listed in
   `SUPPLEMENTAL_PAGE_SHORTCUTS` with `bucket: 'authenticated'`.

The aside wires `GET /api/v1/recommended-topics` via `getRecommendedTopics` in
`web/lib/api/server/recommended-topics.ts`.

### RSS Media Intents (News, Podcasts, Videos)

News, Podcasts, and Videos each have **two** auth-gated bookmark groups instead of one:

- A **content group** (News Bookmarks / Episode Bookmarks / Video Bookmarks) for item-level
  relations (saved, hidden, recently viewed items).
- A **Source Bookmarks** group (`dataPw: 'sidebar-group-source-bookmarks'`) for source-level
  relations (followed, subscribed, muted, recently viewed sources, import/export).

| Intent   | Group label       | `dataPw`                          | Links                                                                                      |
| -------- | ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| News     | News Bookmarks    | `sidebar-group-news-bookmarks`    | Saved News, Hidden News, Recently Viewed News                                              |
|          | Source Bookmarks  | `sidebar-group-source-bookmarks`  | Followed News Sources, Muted News Sources, **Recently Viewed News Sources**, Import/Export |
| Podcasts | Episode Bookmarks | `sidebar-group-episode-bookmarks` | Saved Episodes, Hidden Episodes, Recently Viewed Episodes                                  |
|          | Source Bookmarks  | `sidebar-group-source-bookmarks`  | Followed Podcasts, Muted Podcasts, **Recently Viewed Podcasts**, Import/Export             |
| Videos   | Video Bookmarks   | `sidebar-group-video-bookmarks`   | Saved Videos, Hidden Videos, Recently Viewed Videos                                        |
|          | Source Bookmarks  | `sidebar-group-source-bookmarks`  | Followed Channels, Muted Channels, **Recently Viewed Channels**, Import/Export             |
