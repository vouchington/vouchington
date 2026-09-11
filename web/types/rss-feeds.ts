interface RssFeedUrl {
  id: string
  url: string
}

interface RssFeedTopic {
  id: string
  name: string
  slug: string
  topic_type: string
}

interface RssFeedHostname {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
}

export interface RssFeedTopicElection {
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export interface RssFeedPublisherType {
  id: string
  slug: string
  topic_type: string
  name: string
}

export interface PodcastShow {
  itunes_author: string | null
  itunes_owner_name: string | null
  /** Pre-proxied absolute image-host /sideload/ cover-art URL. */
  cover_art_url: string | null
  is_explicit: boolean
  itunes_type: 'episodic' | 'serial' | null
  /** Normalized plain-text channel description; null when absent. */
  description?: string | null
}

export interface RssFeedCategory {
  category_text: string
  topic_id: string | null
  /** Slug of the resolved topic; null when topic_id is null or the topic is deleted/merged. */
  topic_slug: string | null
}

export interface ViewRssFeed {
  __entity_type: 'rss_feed'
  id: string
  title: string
  is_enabled: boolean
  is_discoverable: boolean
  etag: string | null
  last_modified_at: string | null
  last_fetched_at: string | null
  feed_type: 'article' | 'podcast' | 'video' | 'mixed'
  rss_feed_url: RssFeedUrl
  home_page_url: { id?: string; url: string } | null
  hostname?: RssFeedHostname | null
  topic: RssFeedTopic
  publisher_type?: RssFeedPublisherType | null
  /** Podcast show metadata; non-null when feed_type='podcast' and itunes data present. */
  podcast_show?: PodcastShow | null
  /** Feed-level Apple itunes:category values, ordered alphabetically. */
  categories?: RssFeedCategory[]
}

/** One crawl attempt in a feed's crawl history; matches OpenAPI `RssFeedCrawlSummary`. */
export interface RssFeedCrawlSummary {
  id: string
  response_code: number
  created_at: string
}
