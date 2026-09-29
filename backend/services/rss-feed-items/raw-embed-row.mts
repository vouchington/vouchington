import type { ResolvedEmbed } from '@vouchington/embeds'
import type { CrawlerHtmlStructuredObject } from '@voucha/types/entities/crawl'

export type RawEmbedRow = {
  rss_feed_item_id: string | null
  source_url: string | null
  media_type: string | null
  video_id: string | null
  video_platform: string | null
  rss_player_url: string | null
  display_embed_kind: 'article' | 'player' | null
  display_provider_key: string | null
  display_provider_resource_id: string | null
  display_player_url: string | null
  display_player_width: number | null
  display_player_height: number | null
  display_embed_metadata_resolved: boolean
  embed_metadata: ResolvedEmbed | null
  meta_tags: CrawlerHtmlStructuredObject | null
  embed_oembed_url: string | null
  embed_oembed_resolved_at: Date | null
  enclosure_url: string | null
  crawl_audio_url: string | null
  crawl_source_url: string | null
  enclosure_type: string | null
  duration_seconds: number | null
  thumbnail_urls: Array<string | null>
  title: string | null
  description: string | null
  provider_name: string | null
  markdown: string | null
  show_id: string | null
  show_title: string | null
  show_topic_slug: string | null
  show_topic_type: string | null
}
