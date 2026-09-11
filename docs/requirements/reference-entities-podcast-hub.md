# URL-Routable Entity Catalog reference

[Back to URL-Routable Entity Catalog](ENTITIES.md)

## Podcast hub

The podcast hub is **not** a topic type. It is a filtered view over `rss_feeds` rows
with `feed_type='podcast'`. Show pages use the existing `/source/[id]` route.

| Entity / Surface        | URL shape(s)                | Route dir                                           | Canonical helper                  | Notes                                                     |
| ----------------------- | --------------------------- | --------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| podcast hub             | `/podcasts`                 | `(podcasts)/podcasts`                               | `podcastsHref()`                  | Grid of all discoverable podcast shows                    |
| podcast category browse | `/podcasts/[category]`      | `(podcasts)/podcasts/[category]`                    | `podcastCategoryHref(category)`   | Filtered by Apple iTunes category (slug, e.g. `business`) |
| podcast show (detail)   | `/source/[idOrSlug]/latest` | `(topics)/source` (shared with rss_feed topic type) | `topicHref(feed.topic, 'latest')` | No new canonical URL; uses existing source/topic route    |

All helpers live in: `web/lib/links/entity-href.ts`

---
