import type { Topic } from './topic.mts'

// Local, non-exported duplicates of @services/urls/types#ViewUrl and
// @services/urls-hostnames/types#ViewHostname/#PublicViewHostname field shapes. Entity files
// here must have zero dependency on @services/* — see topic.mts's PublicViewHostname for the
// same established pattern.
type ViewHostname = {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
  blocked: boolean
  crawlable: boolean | null
  skip_web_risk: boolean
  link_rel_follow: boolean | null
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

type PublicViewHostname = Pick<ViewHostname, '__entity_type' | 'id' | 'hostname' | 'topic_id'>

type ViewUrl = {
  __entity_type: 'url'
  id: string
  hostname: ViewHostname
  canonical_url_id: string | null
  url: string
  pathname: string
  search_params: Record<string, string>
}

type ViewRootUrl = {
  id?: string
  url: string
}

type ViewPublisherTypeTopic = {
  id: string
  slug: string
  topic_type: string
  name: string
}

export type PodcastShow = {
  itunes_author: string | null
  itunes_owner_name: string | null
  /** Raw itunes:image href; emitted as an absolute image-host /sideload/ URL at response time. */
  cover_art_url: string | null
  is_explicit: boolean
  itunes_type: 'episodic' | 'serial' | null
}

export type RssFeedCategory = {
  category_text: string
  topic_id: string | null
  /** Slug of the resolved topic; null when topic_id is null or the topic is deleted/merged. */
  topic_slug: string | null
}

export type ViewRssFeed = {
  __entity_type: 'rss_feed'
  id: string
  title: string
  is_enabled: boolean
  is_discoverable: boolean
  etag: string | null
  last_modified_at: Date | null
  last_fetched_at: Date | null
  feed_type: 'article' | 'podcast' | 'video' | 'mixed'
  rss_feed_url: ViewUrl
  home_page_url: ViewRootUrl | null
  hostname: PublicViewHostname | null
  topic: Topic
  publisher_type: ViewPublisherTypeTopic | null
  /** Podcast show metadata; non-null only when feed_type='podcast' and itunes data is present. */
  podcast_show?: PodcastShow | null
  /** Feed-level Apple itunes:category values, ordered alphabetically. */
  categories?: RssFeedCategory[]
}
