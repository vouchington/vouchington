import { addUrl } from '@services/urls'
import { setCanonicalUrl, CircularCanonicalReferenceError } from '@services/urls/set-canonical'
import { findExistingFeedByUrlId } from './find-existing-feed.mts'
import { setCanonicalRssFeed, CircularRssFeedCanonicalError } from './set-canonical.mts'
import { updateRssFeedById } from './update.mts'
import { safeResolveUrl } from '@services/crawls/crawl-url-utils'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isHttpError } from 'http-errors'
import onError from '@modules/on-error'
import type { CrawlerRssRedirect } from '@services/crawler-rss'
import type { RssFeedToFetch } from './get-to-fetch.mts'
import { disableAndHideSource } from './disable-and-hide-source.mts'

type RedirectHandleResult = { type: 'done' } | { type: 'follow'; url: string }

/**
 * Handles a 3xx redirect from a CrawlerRss fetch.
 * For permanent redirects, canonicalizes the feed URL and either disables the source
 * (if a canonical feed already exists) or updates the source to the new URL.
 * For temporary redirects, returns a follow action for the caller to re-fetch.
 * Returns { type: 'follow', url } to instruct the caller to re-fetch at the given URL,
 * or { type: 'done' } if no further fetching is needed.
 */
export async function handleRssFeedRedirect(params: {
  rssFeedId: string
  rssFeed: RssFeedToFetch
  data: CrawlerRssRedirect
  hopCount: number
  maxHops: number
  persistFetchResult: (p: {
    responseCode: number
    headers: { etag: string | null; lastModified: string | null }
    redirectUrlId?: string | null
  }) => Promise<void>
}): Promise<RedirectHandleResult> {
  const { rssFeedId, rssFeed, data, hopCount, maxHops, persistFetchResult } = params

  if (hopCount >= maxHops) {
    onError(
      new Error(`RSS feed redirect hop limit exceeded for feed ${rssFeedId} (${rssFeed.url})`),
    )
    await persistFetchResult({ responseCode: data.responseCode, headers: data.headers })
    return { type: 'done' }
  }

  const resolvedUrl = safeResolveUrl(data.redirect.location, rssFeed.url)
  if (!resolvedUrl) {
    await persistFetchResult({ responseCode: data.responseCode, headers: data.headers })
    return { type: 'done' }
  }

  if (resolvedUrl === rssFeed.url) {
    // Self-redirect: record and stop
    await persistFetchResult({ responseCode: data.responseCode, headers: data.headers })
    return { type: 'done' }
  }

  const isHttpRedirect = new URL(resolvedUrl).protocol === 'http:'
  const targetUrl = await addUrl(null, resolvedUrl, { preserveHttp: isHttpRedirect }).catch(err => {
    if (isHttpError(err) && err.status === 400) return null
    throw err
  })
  if (!targetUrl) {
    // Blocked host: record redirect status without following
    await persistFetchResult({ responseCode: data.responseCode, headers: data.headers })
    return { type: 'done' }
  }

  // Record the crawl with redirect_url_id
  await persistFetchResult({
    responseCode: data.responseCode,
    headers: data.headers,
    redirectUrlId: targetUrl.id,
  })

  if (data.redirect.isPermanent) {
    // Permanent redirect: canonicalize + disable source + enqueue canonical fetch
    const rssFeedUrlId = await getRssFeedUrlId(rssFeedId)

    try {
      await setCanonicalUrl(rssFeedUrlId, targetUrl.id)
    } catch (err) {
      if (!(err instanceof CircularCanonicalReferenceError)) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    }

    const existingFeed = await findExistingFeedByUrlId(targetUrl.id)
    if (existingFeed && existingFeed.id !== rssFeedId) {
      // Canonical feed already exists: set canonical chain and disable source
      try {
        await setCanonicalRssFeed(rssFeedId, existingFeed.id)
      } catch (err) {
        if (!(err instanceof CircularRssFeedCanonicalError)) {
          onError(err instanceof Error ? err : new Error(String(err)))
        }
      }
      await disableAndHideSource(rssFeedId)
      void enqueueBulkFetchRssFeeds([existingFeed.id], {
        ttl: 0,
        deduplicationScope: 'request',
      })
      return { type: 'done' }
    }

    // No existing canonical feed: update this feed's URL and re-fetch
    await updateRssFeedById(
      rssFeedId,
      { rss_feed_url: resolvedUrl },
      { preserveHttp: isHttpRedirect },
    )
  }

  // Temporary redirect or permanent with no existing canonical: follow to resolved URL
  return { type: 'follow', url: resolvedUrl }
}

async function getRssFeedUrlId(rssFeedId: string): Promise<string> {
  const { rows } = await read(sql`/* getRssFeedUrlId */
    SELECT rss_feed_url_id FROM rss_feeds WHERE id = ${rssFeedId} LIMIT 1
  `)
  const urlId = rows[0]?.rss_feed_url_id as string | undefined
  assert(urlId, 500, `RSS feed not found: ${rssFeedId}`)
  return urlId
}
