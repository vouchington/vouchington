# Podcast Episodes (rss_feed_item, feed_type='podcast')

[Back to Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md)

| Entity                    | Flow   | Authorization | Page/Route                                               | Component (file:line)                                               | Notes                                                                                                                                         |
| ------------------------- | ------ | ------------- | -------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `rss_feed_item` (podcast) | Listen | Public        | `/podcasts`, `/podcasts/[category]`, `/source/[id]/news` | `web/components/feed/podcast-episode-player.tsx` (native `<audio>`) | Registers episode in `PodcastPlayerProvider` on play. Future: global mini-player and Swift app share the same `PodcastEpisode` REST contract. |
