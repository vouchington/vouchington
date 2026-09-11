import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'

export type EmbedPreviewFallback = {
  title?: string | null
  description?: string | null
  thumbnailUrl?: string | null
  sourceUrl?: string | null
}

export type EmbedPreview = {
  title: string | null
  description: string | null
  provider: string | null
  thumbnailUrl: string | null
  sourceUrl: string | null
  playerUrl: string | null
  platform: string | null
  rawMetaTags: UrlEmbed['meta_tags']
}

export type EmbedAudioFallback = Partial<
  Pick<UrlEmbed, 'enclosure_url' | 'enclosure_type' | 'duration_seconds' | 'media_type'>
> & {
  enclosureUrl?: string
  enclosureType?: string
  durationSeconds?: number
  mediaType?: UrlEmbed['media_type']
}

export type EmbedAudio = {
  enclosureUrl: string | null
  enclosureType: string | undefined
  durationSeconds: number | undefined
  mediaType: UrlEmbed['media_type'] | undefined
}

/**
 * Selects the backend-authorized enclosure first, retaining RSS media fields
 * when a sidecar only contributes a crawl-derived enclosure.
 */
export function selectEmbedAudio(
  embed: UrlEmbed | null | undefined,
  fallback: EmbedAudioFallback = {},
): EmbedAudio {
  const fallbackEnclosureUrl = fallback.enclosureUrl ?? fallback.enclosure_url
  const enclosureUrl = embed?.enclosure_url ?? fallbackEnclosureUrl ?? null
  return {
    enclosureUrl,
    enclosureType:
      embed?.enclosure_type ?? fallback.enclosureType ?? fallback.enclosure_type ?? undefined,
    durationSeconds:
      embed?.duration_seconds ?? fallback.durationSeconds ?? fallback.duration_seconds ?? undefined,
    mediaType: embed?.media_type ?? fallback.mediaType ?? fallback.media_type,
  }
}

/**
 * Applies display-only fallback rules without ever treating raw tags as URLs.
 * The backend continues to authorize player and image URLs.
 */
export function selectEmbedPreview(
  embed: UrlEmbed | null | undefined,
  fallback: EmbedPreviewFallback = {},
): EmbedPreview {
  const tags = embed?.meta_tags ?? null
  const sourceUrl = embed?.source_url ?? fallback.sourceUrl ?? null
  const playerUrl = embed?.player_url ?? null

  return {
    title: firstText(
      embed?.title,
      embed?.embed_metadata?.title,
      metaText(tags, 'og:title'),
      metaText(tags, 'twitter:title'),
      fallback.title,
    ),
    description: firstText(
      embed?.description,
      embed?.embed_metadata?.description,
      metaText(tags, 'og:description'),
      metaText(tags, 'twitter:description'),
      fallback.description,
    ),
    provider: firstText(
      embed?.provider_name,
      embed?.embed_metadata?.provider?.name,
      metaText(tags, 'og:site_name'),
      sourceHostname(sourceUrl),
    ),
    // Raw image tags are descriptive data only. They are never renderable URLs.
    thumbnailUrl: embed?.thumbnail_url ?? fallback.thumbnailUrl ?? null,
    sourceUrl,
    playerUrl,
    platform:
      platformForPlayer(playerUrl) ??
      embed?.video_platform ??
      embed?.embed_metadata?.provider?.key ??
      null,
    rawMetaTags: tags,
  }
}

/** A present sidecar is authoritative even when it deliberately clears the RSS player URL. */
export function selectAuthorizedPlayerUrl(
  embed: UrlEmbed | null | undefined,
  rssPlayerUrl: string | null | undefined,
): string | null | undefined {
  return embed === undefined ? rssPlayerUrl : embed?.player_url
}

export function selectCrawlEmbedPreview({
  embedMetadata,
  metaTags,
  title,
  safeThumbnailUrl,
}: {
  embedMetadata: UrlEmbed['embed_metadata']
  metaTags: UrlEmbed['meta_tags']
  title: string | null
  safeThumbnailUrl: string | null
}): EmbedPreview {
  const sourceUrl = embedMetadata?.resolvedUrl ?? null
  const playerUrl = embedMetadata?.player?.url ?? null
  return {
    title: firstText(
      embedMetadata?.title,
      metaText(metaTags, 'og:title'),
      metaText(metaTags, 'twitter:title'),
      title,
    ),
    description: firstText(
      embedMetadata?.description,
      metaText(metaTags, 'og:description'),
      metaText(metaTags, 'twitter:description'),
      metaText(metaTags, 'description'),
    ),
    provider: firstText(
      embedMetadata?.provider?.name,
      metaText(metaTags, 'og:site_name'),
      sourceHostname(sourceUrl),
    ),
    thumbnailUrl: safeThumbnailUrl,
    sourceUrl,
    playerUrl,
    platform: embedMetadata?.provider?.key ?? platformForPlayer(playerUrl),
    rawMetaTags: metaTags,
  }
}

function metaText(tags: UrlEmbed['meta_tags'], wanted: string): string | null {
  if (!tags) return null
  const entry = Object.entries(tags).find(([key]) => key.toLowerCase() === wanted)
  return typeof entry?.[1] === 'string' && entry[1].trim() ? entry[1] : null
}

function firstText(...values: Array<string | null | undefined>): string | null {
  return (
    values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ??
    null
  )
}

function sourceHostname(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null
  try {
    return new URL(sourceUrl).hostname || null
  } catch {
    return null
  }
}

function platformForPlayer(playerUrl: string | null): string | null {
  if (!playerUrl) return null
  try {
    const hostname = new URL(playerUrl).hostname
    if (hostname === 'www.youtube-nocookie.com') return 'youtube'
    if (hostname === 'player.vimeo.com') return 'vimeo'
  } catch {
    // VideoEmbed applies the final iframe-boundary allowlist.
  }
  return null
}
