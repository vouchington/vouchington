import { parseFeedDocument } from '@vouchington/rss-parser'
import {
  matchEmbedProvider,
  peerTubeProvider,
  vimeoProvider,
  youtubeProvider,
} from '@vouchington/embeds/providers'
import type { RssFeedItemToUpsert } from '@services/rss-feed-items/types'
import type { ParsedFeed } from './types.mts'
import {
  classifyItemMediaType,
  extractEnclosure,
  extractVideoId,
  extractDuration,
  extractThumbnail,
  extractFirstImageSrc,
} from '@services/rss-feed-items/media-classify'
import { sanitizeRssFeedItemDateString, itemIsoDate } from '@services/rss-feed-items/dates'
import {
  analyzeRssFeedItemCategories,
  RSS_FEED_FETCH_MAX_ITEMS,
  RSS_FEED_ITEM_MAX_CATEGORIES,
} from '@services/rss-feed-items/processing-limits'
import {
  itemCategories,
  itemContentEncoded,
  itemGuid,
  itemLink,
} from '@services/rss-feed-items/clean-helpers'
import {
  extractMediaDescription,
  extractMediaStarRating,
  extractMediaStatistics,
} from '@services/rss-feed-items/media-community'
import { extractPodcastChaptersReference } from '@services/rss-feed-items/chapters-reference'

const VIDEO_PROVIDERS = [youtubeProvider, vimeoProvider, peerTubeProvider] as const

export type RssFeedItemBuildStats = {
  totalParsedItems: number
  validItemsBeforeCap: number
  returnedItems: number
  itemCap: number
  itemTruncatedCount: number
  categoryCap: number
  // Category truncation counts apply to returned items; itemTruncatedCount covers dropped items.
  categoryTruncatedItemCount: number
  categoryTruncatedCount: number
}

export type BoundedRssFeedItems = {
  items: RssFeedItemToUpsert[]
  stats: RssFeedItemBuildStats
}

export function parseRssFeedItemsFromXml(feedXml: Buffer, feedUrl?: string): RssFeedItemToUpsert[] {
  const { feed } = parseFeedDocument(feedXml)
  return buildRssFeedItemsFromFeed(feed as ParsedFeed, feedUrl)
}

/**
 * @deprecated Prefer buildBoundedRssFeedItemsFromFeed so item-cap stats are explicit.
 */
export function buildRssFeedItemsFromFeed(
  feed: ParsedFeed,
  feedUrl?: string,
): RssFeedItemToUpsert[] {
  // This legacy helper keeps item count unbounded but still applies category normalization/capping.
  return buildBoundedRssFeedItemsFromFeed(feed, feedUrl, { maxItems: Number.POSITIVE_INFINITY })
    .items
}

export function buildBoundedRssFeedItemsFromFeed(
  feed: ParsedFeed,
  feedUrl?: string,
  options: { maxItems?: number } = {},
): BoundedRssFeedItems {
  const items = (feed.items ?? feed.entries ?? []) as unknown[]
  const resolvedFeedUrl = feedUrl?.trim() ?? ''
  const maxItems = options.maxItems ?? RSS_FEED_FETCH_MAX_ITEMS
  const itemCap = Number.isFinite(maxItems) ? maxItems : items.length
  const result: RssFeedItemToUpsert[] = []
  let validItemsBeforeCap = 0
  let categoryTruncatedItemCount = 0
  let categoryTruncatedCount = 0

  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>
    const rawLink = itemLink(item)?.trim()
    if (!rawLink) continue
    let link: string
    try {
      link = resolvedFeedUrl
        ? new URL(rawLink, resolvedFeedUrl).toString()
        : new URL(rawLink).toString()
    } catch {
      continue
    }
    const guid = itemGuid(item) ?? link
    validItemsBeforeCap += 1
    if (result.length >= itemCap) continue

    const categoryAnalysis = analyzeRssFeedItemCategories(itemCategories(item))
    const builtItem = buildFeedItem(item, link, guid, categoryAnalysis.categories, resolvedFeedUrl)
    if (categoryAnalysis.truncatedCount > 0) {
      categoryTruncatedItemCount += 1
      categoryTruncatedCount += categoryAnalysis.truncatedCount
    }
    result.push(builtItem)
  }

  return {
    items: result,
    stats: {
      totalParsedItems: items.length,
      validItemsBeforeCap,
      returnedItems: result.length,
      itemCap,
      itemTruncatedCount: Math.max(0, validItemsBeforeCap - result.length),
      categoryCap: RSS_FEED_ITEM_MAX_CATEGORIES,
      categoryTruncatedItemCount,
      categoryTruncatedCount,
    },
  }
}

function buildFeedItem(
  item: Record<string, unknown>,
  link: string,
  guid: string,
  categories: string[],
  feedUrl?: string,
): RssFeedItemToUpsert {
  const contentEncoded = itemContentEncoded(item)
  const content = typeof item.content === 'string' ? item.content : contentEncoded
  const mediaDescription = extractMediaDescription(item)
  const mediaStarRating = extractMediaStarRating(item)
  const mediaStatistics = extractMediaStatistics(item)

  const mediaType = classifyItemMediaType(item)
  const enclosure = extractEnclosure(item)
  const ytVideoId = extractVideoId(item)
  const thumbnailUrl = extractThumbnail(item) ?? extractFirstImageSrc(content ?? '')
  const chaptersReference = extractPodcastChaptersReference(item, feedUrl)
  const durationSeconds = extractDuration(item)
  let videoId: string | undefined
  let videoPlatform: string | undefined
  let playerUrl: string | undefined
  if (mediaType === 'video') {
    const matchedProvider = matchEmbedProvider(
      ytVideoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(ytVideoId)}` : link,
      VIDEO_PROVIDERS,
    )
    if (matchedProvider) {
      videoId = matchedProvider.match.resourceId
      videoPlatform = matchedProvider.provider.key
      if (
        matchedProvider.match.playerUrl &&
        (videoPlatform === 'youtube' || videoPlatform === 'vimeo')
      ) {
        playerUrl = matchedProvider.match.playerUrl.toString()
      }
    }
  }

  return {
    link,
    guid,
    pubDate: sanitizeRssFeedItemDateString(item.pubDate),
    isoDate: itemIsoDate(item),
    title: typeof item.title === 'string' ? item.title : undefined,
    content,
    'content:encoded': contentEncoded,
    description: typeof item.description === 'string' ? item.description : undefined,
    summary: typeof item.summary === 'string' ? item.summary : undefined,
    contentSnippet: typeof item.contentSnippet === 'string' ? item.contentSnippet : undefined,
    'content:encodedSnippet':
      typeof item['content:encodedSnippet'] === 'string'
        ? item['content:encodedSnippet']
        : undefined,
    ...(mediaDescription && { 'media:description': mediaDescription }),
    ...(mediaStarRating && { 'media:starRating': mediaStarRating }),
    ...(mediaStatistics && { 'media:statistics': mediaStatistics }),
    // Crawler parsing is complete metadata: an empty list explicitly retracts prior categories.
    categories,
    media_type: mediaType,
    ...(enclosure?.url && { enclosure_url: enclosure.url }),
    ...(enclosure?.type && { enclosure_type: enclosure.type }),
    ...(enclosure?.length !== undefined && { enclosure_length: enclosure.length }),
    ...(durationSeconds !== null && { duration_seconds: durationSeconds }),
    ...(thumbnailUrl && { thumbnail_url: thumbnailUrl }),
    ...(chaptersReference && {
      chapters_url: chaptersReference.url,
      ...(chaptersReference.type && { chapters_type: chaptersReference.type }),
    }),
    ...(videoId && { video_id: videoId }),
    ...(videoPlatform && { video_platform: videoPlatform }),
    ...(playerUrl && { player_url: playerUrl }),
  }
}
