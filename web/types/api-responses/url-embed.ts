/** Lossless JSON object. Presentation code narrows individual values before use. */
export type CrawlerHtmlStructuredObject = Record<string, unknown>

export type ResolvedEmbed = {
  kind: 'article' | 'player'
  requestedUrl: string
  resolvedUrl: string
  title: string | null
  description: string | null
  author: { name: string | null; url: string | null } | null
  provider: {
    key: string | null
    name: string | null
    url: string | null
    resourceId: string | null
  } | null
  thumbnail: { url: string; width: number | null; height: number | null } | null
  player: { url: string; width: number | null; height: number | null } | null
}

/**
 * Rich media embed for a link post. Shared between the list-response sidecar
 * (post_link_embeds) and the single-post response (link_embed).
 */
export type UrlEmbed = {
  rss_feed_item_id: string | null
  source_url: string | null
  media_type: 'article' | 'audio' | 'video'
  video_id: string | null
  video_platform: string | null
  player_url: string | null
  player_width: number | null
  player_height: number | null
  enclosure_url: string | null
  enclosure_type: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  title: string | null
  description: string | null
  provider_name: string | null
  markdown: string | null
  show_id: string | null
  show_title: string | null
  show_topic_slug: string | null
  show_topic_type: string | null
  embed_metadata: ResolvedEmbed | null
  meta_tags: CrawlerHtmlStructuredObject | null
  embed_oembed_url: string | null
  embed_oembed_resolved_at: string | null
}
