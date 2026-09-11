# `rss_feed_item` (podcast episode)

[Back to Entity × Action Matrix reference](reference-entity-action-matrix-table-b-entity-action-description.md)

| Action                                                    | Predicate | Description                                                                                                                                                                                                                | Endpoint     | Component                                                              |
| --------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| <a name="rss_feed_item--listen"></a>Listen (Play-Episode) | n/a       | Start audio playback for a podcast episode. Calls `playEpisode(episode)` in `PodcastPlayerProvider` to register the episode as current (future global player / Swift client uses the same context). No backend call today. | n/a (client) | `web/components/feed/podcast-episode-player.tsx` (on `<audio> onPlay`) |

---
