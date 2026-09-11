import type { matchEmbedProvider } from '@vouchington/embeds/providers'
import type { RawEmbedRow } from './url-embed-types.mts'

type ResolvedMediaType = 'article' | 'audio' | 'video' | null

export function normalizeCrawlAudioUrl(
  audioUrl: string | null,
  crawledSourceUrl: string | null,
): string | null {
  if (!audioUrl || !crawledSourceUrl) return null
  try {
    const resolvedUrl = new URL(audioUrl, crawledSourceUrl)
    return resolvedUrl.protocol === 'http:' || resolvedUrl.protocol === 'https:'
      ? resolvedUrl.toString()
      : null
  } catch {
    return null
  }
}

export function resolveMediaState(
  row: RawEmbedRow,
  providerMatch: ReturnType<typeof matchEmbedProvider>,
  hasAuthorizedCrawlPlayer: boolean,
): {
  mediaType: ResolvedMediaType
  videoId: string | null
  videoPlatform: string | null
} {
  let mediaType = row.media_type as ResolvedMediaType
  let videoId = row.video_id
  let videoPlatform = row.video_platform
  const hasStoredMediaType = row.media_type === 'audio' || row.media_type === 'video'

  if (row.display_embed_kind === 'player' && hasAuthorizedCrawlPlayer) {
    if (!hasStoredMediaType) mediaType = 'video'
    if (mediaType === 'video') {
      videoPlatform = row.display_provider_key ?? videoPlatform
      videoId = row.display_provider_resource_id ?? videoId
    }
  }
  if (!mediaType) {
    if (row.enclosure_url) {
      mediaType = 'audio'
    } else if (hasAuthorizedCrawlPlayer || row.display_provider_resource_id) {
      mediaType = 'video'
    } else if (providerMatch) {
      mediaType = 'video'
    }
  }
  if (mediaType === 'video' && row.display_embed_kind !== 'player') {
    videoPlatform ??= row.display_provider_key ?? providerMatch?.provider.key ?? null
    videoId ??= row.display_provider_resource_id ?? providerMatch?.match.resourceId ?? null
  }
  if (mediaType !== 'video') {
    videoId = null
    videoPlatform = null
  }
  return { mediaType, videoId, videoPlatform }
}
