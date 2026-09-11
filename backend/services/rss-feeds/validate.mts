import CrawlerRss from '@services/crawler-rss'
import { classifyFeedType } from '@services/rss-feed-items/media-classify'
import { buildRssFeedItemsFromFeed } from '@services/crawler-rss/clean'
import assert from 'http-assert'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { CrawlerInvalidContentTypeError } from '@modules/on-error/errors'
import { discoverFeedUrlFromHtml } from './discover-feed.mts'
import { isYouTubeChannelFeedUrl } from '@modules/utils'

const MISSING_FEED_CONTENT_ERROR_CODE = 'RSS_FEED_URL_MISSING_CONTENT'

type FeedValidationDeps = {
  crawlerRss?: typeof CrawlerRss
  discoverFeedUrlFromHtml?: typeof discoverFeedUrlFromHtml
  buildRssFeedItemsFromFeed?: typeof buildRssFeedItemsFromFeed
}

function resolveFeedValidationDeps(deps: FeedValidationDeps = {}) {
  return {
    crawlerRss: deps.crawlerRss ?? CrawlerRss,
    discoverFeedUrlFromHtml: deps.discoverFeedUrlFromHtml ?? discoverFeedUrlFromHtml,
    buildRssFeedItemsFromFeed: deps.buildRssFeedItemsFromFeed ?? buildRssFeedItemsFromFeed,
  }
}

function createMissingFeedContentError(): Error & {
  code: string
  status: number
  statusCode: number
} {
  const error = new Error('RSS feed URL did not return feed content') as Error & {
    code: string
    status: number
    statusCode: number
  }
  error.code = MISSING_FEED_CONTENT_ERROR_CODE
  error.status = 422
  error.statusCode = 422
  return error
}

export async function assertRssFeedUrlExists(
  rssFeedUrl: string,
  deps: FeedValidationDeps = {},
): Promise<void> {
  if (process.env.PLAYWRIGHT_TEST === 'true' && process.env.NODE_ENV === 'test') return
  const { crawlerRss } = resolveFeedValidationDeps(deps)
  try {
    const result = await crawlerRss(rssFeedUrl)
    // Redirects are not valid feed content for validation purposes
    if ('redirect' in result && result.redirect) {
      throw createMissingFeedContentError()
    }
    if (!result.feed) {
      throw createMissingFeedContentError()
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      'code' in error &&
      (error as { statusCode?: number }).statusCode === 422 &&
      (error as { code?: string }).code === MISSING_FEED_CONTENT_ERROR_CODE
    ) {
      throw error
    }
    assert(false, 422, 'RSS feed URL must return a valid RSS, Atom, or JSON feed')
  }
}

export type FeedClassification =
  | { kind: 'feed'; title: string | null; feedType: 'article' | 'podcast' | 'video' | 'mixed' }
  | { kind: 'redirect'; location: string; isPermanent: boolean }

/**
 * Fetches, validates, and classifies an RSS feed URL.
 * Returns the feed title and detected feed type, or a redirect descriptor if the feed redirects.
 * Throws 422 if the URL does not return valid feed content and is not a redirect.
 * Should be called before the DB transaction — performs HTTP I/O.
 */
/* no-mistakes: integration=http */
export async function fetchAndClassifyFeed(
  rssFeedUrl: string,
  deps: FeedValidationDeps = {},
): Promise<FeedClassification> {
  const {
    crawlerRss,
    discoverFeedUrlFromHtml: discoverFeedUrlFromHtmlFn,
    buildRssFeedItemsFromFeed: buildRssFeedItemsFromFeedFn,
  } = resolveFeedValidationDeps(deps)

  if (process.env.PLAYWRIGHT_TEST === 'true' && process.env.NODE_ENV === 'test') {
    return { kind: 'feed', title: null, feedType: 'article' }
  }

  let parsedFeed: Record<string, unknown>
  try {
    const result = await crawlerRss(rssFeedUrl)
    if ('redirect' in result && result.redirect) {
      return {
        kind: 'redirect',
        location: result.redirect.location,
        isPermanent: result.redirect.isPermanent,
      }
    }
    if (!result.feed) throw createMissingFeedContentError()
    parsedFeed = result.feed
  } catch (error) {
    // 1. Re-throw the explicit missing-content 422 we created ourselves.
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      'code' in error &&
      (error as { statusCode?: number }).statusCode === 422 &&
      (error as { code?: string }).code === MISSING_FEED_CONTENT_ERROR_CODE
    ) {
      throw error
    }
    // 2. If the URL served HTML (content-type mismatch), attempt RSS autodiscovery.
    //    CrawlerInvalidContentTypeError has status=415, not statusCode=422, so it doesn't
    //    collide with the rethrow above.
    if (
      error instanceof CrawlerInvalidContentTypeError &&
      error.contentType.toLowerCase().includes('html')
    ) {
      try {
        const discovered = await discoverFeedUrlFromHtmlFn(rssFeedUrl)
        if (discovered && discovered !== rssFeedUrl) {
          return { kind: 'redirect', location: discovered, isPermanent: false }
        }
      } catch {
        // Discovery failed — fall through to the clean 422 below.
      }
    }
    // 3. Any other error (network, parse, non-HTML content-type, no feed link found) → 422.
    assert(false, 422, 'RSS feed URL must return a valid RSS, Atom, or JSON feed')
  }

  const title = extractFeedTitle(parsedFeed)

  // buildRssFeedItemsFromFeed already runs classifyItemMediaType on each raw feed item.
  // Re-running it on the normalized output would always return 'article' because the
  // normalized items no longer carry the raw feedsmith fields (yt, enclosures, media, itunes).
  // Filter to items with a classified media_type (the field is optional on the type but
  // always set by buildRssFeedItemsFromFeed — the type predicate ensures TS is satisfied).
  const items = buildRssFeedItemsFromFeedFn(parsedFeed, rssFeedUrl).filter(
    (item): item is typeof item & { media_type: 'article' | 'audio' | 'video' } =>
      item.media_type !== undefined,
  )
  const classifiedFeedType = classifyFeedType(items)
  // YouTube channel feed URLs always classify as video, even if the feed temporarily
  // contains non-video entries (e.g. community posts without yt:videoId).
  const feedType = isYouTubeChannelFeedUrl(rssFeedUrl) ? 'video' : classifiedFeedType

  return { kind: 'feed', title, feedType }
}

/**
 * Extracts the feed title from a parsed feed object.
 * Returns a trimmed string up to 255 chars, or null if none found.
 */
export function extractFeedTitle(parsedFeed: Record<string, unknown>): string | null {
  const title =
    parsedFeed['title'] ?? (parsedFeed['channel'] as Record<string, unknown> | undefined)?.['title']
  if (typeof title !== 'string') return null
  const trimmed = title.trim().slice(0, 255)
  return trimmed || null
}

/**
 * Extracts and normalizes the declared language from a parsed feed object.
 * Returns an ISO 639-1 code we support (e.g. 'en', 'fr'), or null.
 */
export function extractFeedLanguage(parsedFeed: Record<string, unknown>): string | null {
  const candidate = parsedFeed['language'] ?? parsedFeed['xml:lang']
  // Guard against non-string values (arrays, objects) from feedsmith before normalizing
  const raw = typeof candidate === 'string' ? candidate : null
  return normalizeContentLanguageTag(raw)
}

// Podcast-specific extractors are in podcast-extractors.mts (kept separate to stay under max-lines).
export { extractPodcastShowMetadata, extractFeedCategories } from './podcast-extractors.mts'

export function buildSourceTopicName(feedTitle: string, feedUrl: string): string {
  const suffix = ` (${feedUrl})`
  const maxTitleLength = Math.max(0, 255 - suffix.length)
  const title = feedTitle.slice(0, maxTitleLength)
  const name = title ? `${title}${suffix}` : `(${feedUrl})`
  return name.slice(0, 255)
}
