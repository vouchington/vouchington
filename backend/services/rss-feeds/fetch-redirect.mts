import { addUrl } from '@services/urls'
import { setCanonicalUrl, CircularCanonicalReferenceError } from '@services/urls/set-canonical'
import { findExistingFeedByUrlId } from './find-existing-feed.mts'
import { setCanonicalRssFeed, CircularRssFeedCanonicalError } from './set-canonical.mts'
import { updateRssFeedById } from './update.mts'
import {
  lockPostPublicationRssFeedScopes,
  recordPostPublicationChange,
} from '@services/post-publication'
import { safeResolveUrl } from '@services/crawls/crawl-url-utils'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { read, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isHttpError } from 'http-errors'
import onError from '@modules/on-error'
import type { CrawlerRssRedirect } from '@services/crawler-rss'
import { getRssFeedAutoUpdaterUserId } from '@services/users/system-users'
import { invalidate } from '@services/entity-cache/invalidate'
import type { RssFeedToFetch } from './get-to-fetch.mts'

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
  const targetUrl = await addUrl(null, resolvedUrl, { preserveHttp: isHttpRedirect }).catch(
    error => {
      if (isHttpError(error) && error.status === 400) return null
      throw error
    },
  )
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
    } catch (error) {
      if (!(error instanceof CircularCanonicalReferenceError)) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const existingFeed = await findExistingFeedByUrlId(targetUrl.id)
    if (existingFeed && existingFeed.id !== rssFeedId) {
      // Canonical feed already exists: set canonical chain and disable source
      try {
        await setCanonicalRssFeed(rssFeedId, existingFeed.id)
      } catch (error) {
        if (!(error instanceof CircularRssFeedCanonicalError)) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
      }
      await disableAndHideSource(rssFeedId)
      void enqueueBulkFetchRssFeeds([existingFeed.id], { ttl: 0 })
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

/**
 * Soft-deletes the source topic and disables the feed for a permanently-redirected feed.
 * Only marks the topic deleted if its topic_type is 'rss_feed' (avoids hiding manually-created topics).
 */
export async function disableAndHideSource(rssFeedId: string): Promise<void> {
  const systemUserId = await getRssFeedAutoUpdaterUserId()
  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  await lockPostPublicationRssFeedScopes(query, [rssFeedId])
  await query(
    `/* disableAndHideSource:rss_feed */
       INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, created_by_id, reason)
       VALUES ($1, FALSE, $2, 'permanent redirect to canonical feed')
      `,
    [rssFeedId, systemUserId],
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'rss_feed', rssFeedId },
    reason: 'rss_feed_discoverability_changed',
  })
  await query(
    `/* disableAndHideSource:discoverability */
       INSERT INTO rss_feed_discoverability_changes (rss_feed_id, enabled, created_by_id, reason)
       VALUES ($1, FALSE, $2, 'permanent redirect to canonical feed')
      `,
    [rssFeedId, systemUserId],
  )
  await query(
    `/* disableAndHideSource:topic */
       UPDATE topics
       SET deleted_at = CURRENT_TIMESTAMP
       FROM rss_feeds
       WHERE rss_feeds.id = $1
         AND rss_feeds.topic_id = topics.id
         AND topics.topic_type = 'rss_feed'
         AND topics.deleted_at IS NULL
      `,
    [rssFeedId],
  )
  await query.commit()
  await invalidate.rss_feeds(rssFeedId)
}

async function getRssFeedUrlId(rssFeedId: string): Promise<string> {
  const { rows } = await read(sql`/* getRssFeedUrlId */
    SELECT rss_feed_url_id FROM rss_feeds WHERE id = ${rssFeedId} LIMIT 1
  `)
  const urlId = rows[0]?.rss_feed_url_id as string | undefined
  assert(urlId, 500, `RSS feed not found: ${rssFeedId}`)
  return urlId
}
