/**
 * Represents a podcast episode to be played.
 * Carries all data a current or future global/Swift player needs,
 * including the episodeId for future playback-position persistence.
 */
export interface PodcastEpisode {
  /** rss_feed_item.id — the join key for future position-persistence. */
  episodeId: string
  enclosureUrl: string
  enclosureType?: string
  durationSeconds?: number
  title: string
  /** rss_feed.id — for "back to show" navigation and grouping. */
  showId: string
  showTitle?: string
  /** Cover-art URL — proxied when sourced from podcast_show.cover_art_url; may be raw when sourced from rss_feed_item.data.thumbnail_url via single-item API. */
  coverArtUrl?: string
  /** Canonical podcast show-page href (topicHref(rss_feed.topic, 'latest')). */
  showHref?: string
}

export interface PodcastPlayerContextValue {
  currentEpisode: PodcastEpisode | null
  miniPlayerHeight: number | null
  playEpisode: (episode: PodcastEpisode) => void
  clearEpisode: () => void
  setQueue: (episodes: PodcastEpisode[]) => void
}
