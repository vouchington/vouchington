# Podcasts reference

[Back to Podcasts](PODCASTS.md)

## Tests

| Layer             | File(s)                                                                   | Coverage                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest            | `backend/services/rss-feeds/__tests__/validate-podcast.test.mts`          | `extractPodcastShowMetadata`, `extractFeedCategories`                                                                                                         |
| Vitest            | `backend/services/rss-feeds/__tests__/podcast-show.test.mts`              | `upsertPodcastShow`, `getPodcastShow` (real PG)                                                                                                               |
| Vitest            | `backend/services/rss-feeds/__tests__/categories.test.mts`                | `upsertRssFeedCategories`, `getRssFeedCategories`                                                                                                             |
| Vitest            | `backend/services/podcast-playback-positions/playback-positions.test.mts` | `upsertPlaybackPosition`, `getPlaybackPosition` (real PG)                                                                                                     |
| Vitest            | `backend/api/v1/podcast-episodes/chapters.test.mts`                       | GET route: optional auth, cache headers, empty responses                                                                                                      |
| Vitest            | `backend/api/v1/podcast-episodes/playback-position.test.mts`              | PUT + GET route: auth, uuid validation, 404, 204/200                                                                                                          |
| Vitest            | `web/lib/podcast-player/context.test.tsx`                                 | `PodcastPlayerProvider` state (logged-out)                                                                                                                    |
| Vitest            | `web/lib/podcast-player/context.mock.test.tsx`                            | Resume fetch, mini-player render (authenticated)                                                                                                              |
| Swift PM          | Client-repository core model and endpoint suites                          | `PodcastChapterResponse` decoding, visibility flags, and `podcastEpisodeChapters` route coverage                                                              |
| Swift UI          | Client-repository playback controller and mini-player suites              | Chapter fetch/load, stale-response protection, rendering, and seeking                                                                                         |
| .NET source audit | Client-repository media playback source audit                             | Static wiring for direct playback, resume, chapters, speed, and cleanup; this is not a behavioral test                                                        |
| Vitest            | `web/lib/podcast-player/mini-player.mock.test.tsx`                        | Chapter fetch/render/seek and explicit playback-rate buttons                                                                                                  |
| Vitest            | `web/lib/api/client/podcast-playback.mock.test.ts`                        | `reportPlaybackPosition`, `fetchPlaybackPosition`                                                                                                             |
| Vitest            | `web/lib/api/client/podcast-episode-chapters.mock.test.ts`                | `fetchPodcastEpisodeChapters`                                                                                                                                 |
| Storybook         | `web/storybook/entities/podcasts.stories.tsx`                             | Hub grid, show card variants, mini-player (`MiniPlayerPlaying`)                                                                                               |
| Playwright        | `playwright/tests/podcasts/podcasts.spec.mts`                             | `/podcasts`, `/podcasts/[category]`, episode player, mini-player links (`podcast-mini-player-title`, `podcast-mini-player-show`, `podcast-mini-player-cover`) |

## Episode Categories

Podcast episodes rarely carry per-episode `<category>` tags, so their category display
is driven by the autotagger rather than feed-parsed data:

- When feed-level `rss_feed_categories` rows have `topic_id` mappings, the autotagger
  seeds its candidate set with those mapped topics and confirms the ones it considers
  genuinely relevant for the episode.
- The resulting `relation__rss_feed_item__category__topic` rows (with `votes_score_net > 0`)
  are what `view_rss_feed_items.categories` returns — the same relation-backed pipeline
  used for all RSS feed items.
- Feed-level categories (`rss_feed_categories`) are **not** shown directly on episode
  cards; they only seed the autotagger's candidate pool.

See [NEWS-DISCUSSIONS.md § Category Display](./NEWS-DISCUSSIONS.md#category-display) for
the full ordering and display rules.

## See Also

- [Sources & Domains](./SOURCES-DOMAINS.md) — source submission and management
- [RSS Feed Crawling](./RSS-FEED-CRAWLING.md) — crawl pipeline and item processing
- [RSS Feed Category Aliases](./RSS-FEED-CATEGORY-ALIASES.md) — admin category mapping
- [TOPICS.md § Type vs facet](./reference-topics-topic-types.md#type-vs-facet) — decision rule used here
- [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md) — podcast episode actions
- [Entity × Lifecycle Flow Matrix](../ENTITY-LIFECYCLE-MATRIX.md) — podcast Listen flow
