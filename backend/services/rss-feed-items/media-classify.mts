/**
 * Media type classification for RSS feed items.
 * Detects podcasts (audio enclosures) and videos (YouTube, Vimeo, PeerTube)
 * from feedsmith-parsed item data.
 */
import { parseDuration } from '@ts-shared/utils/dates'
export { classifyFeedType } from './media-feed-type.mts'
export { extractThumbnail } from './media-thumbnail.mts'

type FeedItem = Record<string, unknown>
type MediaType = 'article' | 'audio' | 'video'

type Enclosure = {
  url: string
  type?: string
  length?: number
}

/** Classify a single feed item as article, audio, or video */
export function classifyItemMediaType(item: FeedItem): MediaType {
  // YouTube Atom feed has yt.videoId or yt:videoId namespace
  const yt = item.yt as Record<string, unknown> | undefined
  if (yt?.videoId || item['yt:videoId']) return 'video'

  const enclosure = extractEnclosure(item)
  if (enclosure?.type) {
    if (enclosure.type.startsWith('audio/')) return 'audio'
    if (enclosure.type.startsWith('video/')) return 'video'
  }

  // Media RSS with medium attribute
  const media = item.media as Record<string, unknown> | undefined
  if (media) {
    const contents = media.contents as Array<Record<string, unknown>> | undefined
    if (Array.isArray(contents)) {
      for (const content of contents) {
        const medium = content.medium as string | undefined
        if (medium === 'video') return 'video'
        if (medium === 'audio') return 'audio'
      }
    }
  }

  // iTunes duration means it's a podcast episode
  const itunes = item.itunes as Record<string, unknown> | undefined
  if (itunes?.duration !== undefined) return 'audio'

  return 'article'
}

/** Extract the first audio or video enclosure from a feed item */
export function extractEnclosure(item: FeedItem): Enclosure | null {
  const enclosures = item.enclosures as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(enclosures) || enclosures.length === 0) return null

  for (const enc of enclosures) {
    const url = enc.url as string | undefined
    const type = enc.type as string | undefined
    if (!url) continue
    if (!type) continue
    if (type.startsWith('audio/') || type.startsWith('video/')) {
      const length = enc.length !== undefined ? Number(enc.length) : undefined
      return {
        url,
        type,
        length: length !== undefined && !Number.isNaN(length) && length >= 0 ? length : undefined,
      }
    }
  }

  // Fallback: first enclosure with url even without known media type
  const first = enclosures[0]
  const url = first?.url as string | undefined
  if (!url) return null
  const fallbackLength = first.length !== undefined ? Number(first.length) : undefined
  return {
    url,
    type: first.type as string | undefined,
    length:
      fallbackLength !== undefined && !Number.isNaN(fallbackLength) && fallbackLength >= 0
        ? fallbackLength
        : undefined,
  }
}

/** Extract YouTube video ID from yt namespace or URL patterns */
export function extractVideoId(item: FeedItem): string | null {
  const yt = item.yt as Record<string, unknown> | undefined
  if (typeof yt?.videoId === 'string' && yt.videoId.trim()) return yt.videoId.trim()

  const ytVideoId = item['yt:videoId']
  if (typeof ytVideoId === 'string' && ytVideoId.trim()) return ytVideoId.trim()

  return null
}

/** Extract duration in seconds from itunes namespace */
export function extractDuration(item: FeedItem): number | null {
  const itunes = item.itunes as Record<string, unknown> | undefined
  const duration = parseDuration(itunes?.duration)
  if (duration !== null) return duration

  return null
}

/**
 * Extract the first external (http/https) `<img src>` URL from raw HTML.
 *
 * Used as a thumbnail fallback when the feed does not supply `itunes:image`
 * or `media:thumbnail`. Only http/https URLs are returned; relative and
 * data: URLs are ignored.
 */
export function extractFirstImageSrc(html: string): string | null {
  const match = /<img\b[^>]*?\ssrc=["']([^"']+)["']/i.exec(html)
  if (!match) return null
  const src = match[1]!.trim()
  const lower = src.toLowerCase()
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return null
  return src
}
