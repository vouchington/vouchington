import {
  matchEmbedProvider,
  peerTubeProvider,
  vimeoProvider,
  youtubeProvider,
} from '@vouchington/embeds/providers'
import type { ResolvedEmbed } from '@vouchington/embeds'
import type { CrawlerHtmlStructuredObject } from '@voucha/types/entities/crawl'
import { normalizeCrawlAudioUrl, resolveMediaState } from './url-embed-media.mts'
import { buildThumbnailUrl } from './url-embed-thumbnail.mts'

const VIDEO_PROVIDERS = [youtubeProvider, vimeoProvider, peerTubeProvider] as const
type Player = { url: string; width: number | null; height: number | null }
export type UrlEmbed = {
  /** RSS item identity and outbound source URL. */
  rss_feed_item_id: string | null
  source_url: string | null
  /** Content classification, video provider identity, and backend-authorized player. */
  media_type: 'article' | 'audio' | 'video'
  video_id: string | null
  video_platform: string | null
  player_url: string | null
  player_width: number | null
  player_height: number | null
  /** Media enclosure, duration, and proxied thumbnail. */
  enclosure_url: string | null
  enclosure_type: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  /** Safe title, description, and publisher selected from embed or social metadata. */
  title: string | null
  description: string | null
  provider_name: string | null
  /** Crawled article markdown from the selected successful embed crawl. */
  markdown: string | null
  /** RSS show identity and topic for source-backed audio episodes. */
  show_id: string | null
  show_title: string | null
  show_topic_slug: string | null
  show_topic_type: string | null
  /** Administrator-only raw crawl metadata and oEmbed provenance. */
  embed_metadata: ResolvedEmbed | null
  meta_tags: CrawlerHtmlStructuredObject | null
  embed_oembed_url: string | null
  embed_oembed_resolved_at: string | null
}

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
/** Crawl fields are administrator-only; consumers must use public access unless authorized. */
export type UrlEmbedAccess = 'administrator' | 'public'
export function buildEmbed(row: RawEmbedRow, access: UrlEmbedAccess = 'public'): UrlEmbed {
  const crawlAudioUrl = normalizeCrawlAudioUrl(row.crawl_audio_url, row.crawl_source_url)
  const enclosureUrl = row.enclosure_url ?? crawlAudioUrl
  const mediaRow =
    crawlAudioUrl && !row.enclosure_url && row.media_type !== 'audio' && row.media_type !== 'video'
      ? { ...row, enclosure_url: enclosureUrl, media_type: 'audio' }
      : { ...row, enclosure_url: enclosureUrl }
  const providerMatch =
    !row.display_embed_metadata_resolved && row.source_url
      ? matchEmbedProvider(row.source_url, VIDEO_PROVIDERS)
      : null
  const crawlPlayer = displayPlayer(row)
  const { mediaType, videoId, videoPlatform } = resolveMediaState(
    mediaRow,
    providerMatch,
    Boolean(crawlPlayer),
  )
  const player =
    mediaType === 'video'
      ? (crawlPlayer ??
        trustedRssPlayer(row.rss_player_url, videoPlatform, videoId) ??
        (row.display_embed_metadata_resolved ? null : trustedPresetPlayer(providerMatch)))
      : null
  const thumbnail_url = buildThumbnailUrl(row.thumbnail_urls)
  return {
    rss_feed_item_id: row.rss_feed_item_id,
    source_url: row.source_url,
    media_type: mediaType ?? 'article',
    video_id: videoId,
    video_platform: videoPlatform,
    player_url: player?.url ?? null,
    player_width: player?.width ?? null,
    player_height: player?.height ?? null,
    enclosure_url: enclosureUrl,
    enclosure_type: row.enclosure_type,
    duration_seconds: row.duration_seconds,
    thumbnail_url,
    title: row.title,
    description: row.description,
    provider_name: row.provider_name,
    markdown: access === 'administrator' ? row.markdown : null,
    show_id: row.show_id,
    show_title: row.show_title,
    show_topic_slug: row.show_topic_slug,
    show_topic_type: row.show_topic_type,
    embed_metadata: access === 'administrator' ? row.embed_metadata : null,
    meta_tags: access === 'administrator' ? row.meta_tags : null,
    embed_oembed_url: access === 'administrator' ? row.embed_oembed_url : null,
    embed_oembed_resolved_at:
      access === 'administrator' ? (row.embed_oembed_resolved_at?.toISOString() ?? null) : null,
  }
}

function displayPlayer(
  row: Pick<RawEmbedRow, 'display_player_url' | 'display_player_width' | 'display_player_height'>,
): Player | null {
  const url = authorizedCrawlPlayerUrl(row.display_player_url)
  if (!url) return null
  return {
    url,
    width: row.display_player_width,
    height: row.display_player_height,
  }
}
function authorizedCrawlPlayerUrl(playerUrl: string | null): string | null {
  if (!playerUrl) return null
  try {
    const url = new URL(playerUrl)
    const authority = /^https:\/\/([^/?#]+)/.exec(playerUrl)?.[1]
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      authority !== url.hostname
    ) {
      return null
    }
    if (
      (url.hostname === 'www.youtube-nocookie.com' && url.pathname.startsWith('/embed/')) ||
      (url.hostname === 'player.vimeo.com' && url.pathname.startsWith('/video/'))
    ) {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}
function trustedRssPlayer(
  playerUrl: string | null,
  videoPlatform: string | null,
  videoId: string | null,
): Player | null {
  if (!videoId) return null
  const providerUrl =
    videoPlatform === 'youtube'
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      : videoPlatform === 'vimeo'
        ? `https://vimeo.com/${encodeURIComponent(videoId)}`
        : null
  const expectedPlayer = providerUrl
    ? trustedPresetPlayer(matchEmbedProvider(providerUrl, VIDEO_PROVIDERS))
    : null
  if (!playerUrl) return expectedPlayer
  return expectedPlayer?.url === playerUrl ? expectedPlayer : null
}

function trustedPresetPlayer(providerMatch: ReturnType<typeof matchEmbedProvider>): Player | null {
  if (!providerMatch?.match.playerUrl) return null
  if (providerMatch.provider.key !== 'youtube' && providerMatch.provider.key !== 'vimeo')
    return null
  return { url: providerMatch.match.playerUrl.toString(), width: null, height: null }
}
