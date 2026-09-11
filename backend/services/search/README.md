# @services/search

Combined omnisearch service — fans out across five entity verticals in parallel
and returns a lightweight merged response for the command-search dialog.

## What it does

`searchOmnisearch(options)` runs five entity searches in parallel via
`Promise.allSettled` and projects each to only the fields the dialog renders:

| Vertical    | Source                                                             | Fields returned              |
| ----------- | ------------------------------------------------------------------ | ---------------------------- |
| topics      | `@services/topics/search/get-ids`                                  | `id, name, slug, topic_type` |
| posts       | `@services/posts/search/get-ids` + `@services/entity-cache` batch  | `id, post_type, title`       |
| news        | `@services/rss-feed-items/search` + `@services/entity-cache` batch | `id, url, title, feed_title` |
| domains     | `@services/urls-hostnames`                                         | `id, hostname`               |
| communities | `@services/communities` + `@services/bookmarks/get`                | `id, name, slug, bookmarked` |

A failing vertical returns `[]` for that key; the other four are unaffected.

## Usage

```ts
import { searchOmnisearch } from '@services/search'

const result = await searchOmnisearch({
  currentUser, // PrivateUser | null — switches between cached and live paths
  textSearchQuery, // plain-text portion after hashtag stripping
  hashtagTopicIds, // resolved topic IDs from #mention parsing
  hashtagAliasIds, // unlinked aliases, supported by posts and news
  hasUnknownHashtag, // returns no results when any #mention cannot resolve
  limit, // per-vertical cap (default 3)
})
// result: { topics, posts, news, domains, communities }
```

## Design notes

- `currentUser` selects the code path: logged-out uses Valkey-cached read-replicas;
  logged-in hits the live DB so per-user personalization (post visibility) is respected.
- Posts and news require a secondary batch cache fetch to hydrate titles/URLs — the
  ID-search results only return IDs plus basic fields.
- Community bookmarks are checked via `getBookmarksForEntities` only when a user is
  authenticated; anonymous calls always return `bookmarked: false`.
- The three positive bookmark predicates checked are `follow`, `save`, and `proxy_follow`.
- Linked hashtags filter topics, posts, news, and communities. Unlinked aliases filter posts and
  news exactly; unsupported verticals stay empty so a mixed text query cannot escape the hashtag
  constraint. Any unknown hashtag returns an empty result across all verticals.
