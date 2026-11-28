import { upsertRssFeedItems } from '@services/rss-feed-items'
import { resolveFetchOutcomeAction, type FetchOutcome } from '@services/crawls/fetch-outcome'
import onError from '@modules/on-error'
import { stampRssFeedFetchFailedAt } from './fetch-state.mts'
import { reclassifyRssFeedTypeIfNeeded } from './reclassify-feed-type.mts'
import {
  persistRssFeedCrawlAndMetadata,
  getLatestRssFeedCrawlForFeedWithOptions,
} from './crawls.mts'
import CrawlerRss from '@services/crawler-rss'
import { handleRssFeedRedirect } from './fetch-redirect.mts'
import { getRssFeedByIdToFetch, type RssFeedToFetch } from './get-to-fetch.mts'
import * as fetchFailures from './fetch-failures.mts'
import { checkRssFeedCrawlable } from './fetch-robots-check.mts'
import {
  handleRssFetchRateLimitError,
  loadRssFetchPreflightHealth,
  recordRssFetchHostnameFailure,
  recordRssFetchHostnameSuccess,
} from './fetch-hostname-health.mts'
import { getFetchHostnameId } from './fetch-hostname.mts'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'
import { isHttpError } from 'http-errors'
import { persistFeedMetadataAndReconcileLanguage } from './reconcile-item-language.mts'
import { buildRssFetchOptions } from './fetch-options.mts'
import { buildTrackedRssFeedItemsFromFeed } from './fetch-items.mts'
const MAX_REDIRECT_HOPS = 5
type FetchRssFeedDependencies = {
  checkRssFeedCrawlable: typeof checkRssFeedCrawlable
  crawlerRss: typeof CrawlerRss
  resolveDnsCanary: () => Promise<void>
  upsertRssFeedItems: typeof upsertRssFeedItems
}
type FetchRssFeedOptions = { isFinalAttempt?: boolean }

async function stampFetchOutcome(rssFeedId: string, outcome: FetchOutcome): Promise<void> {
  if (resolveFetchOutcomeAction(outcome).timestampColumn === 'last_fetch_failed_at') {
    await stampRssFeedFetchFailedAt(rssFeedId)
  }
}

export async function fetchRssFeed(
  rssFeedId: string,
  ttl: number = 60_000,
  overrideUrl: string | null = null,
  hopCount: number = 0,
  dependencies: Partial<FetchRssFeedDependencies> = {},
  fetchOptions: FetchRssFeedOptions = {},
) {
  const isFinalAttempt = fetchOptions.isFinalAttempt ?? true
  const crawlableCheck = dependencies.checkRssFeedCrawlable ?? checkRssFeedCrawlable
  const fetchCrawlerRss = dependencies.crawlerRss ?? CrawlerRss
  const upsertItems = dependencies.upsertRssFeedItems ?? upsertRssFeedItems
  const rssFeed = await getRssFeedByIdToFetch(rssFeedId, { ttl })
  if (!rssFeed) return []
  const feedUrl = overrideUrl ?? rssFeed.url
  if (!rssFeed.crawlable) {
    await stampFetchOutcome(rssFeedId, { kind: 'skipped' })
    return []
  }
  let skipFinalFailureStamp = false
  try {
    const fetchHostnameId = await getFetchHostnameId(rssFeed.url_hostname_id, rssFeed.url, feedUrl)
    const networkBackoff = await loadRssFetchPreflightHealth(fetchHostnameId, feedUrl)
    if (!networkBackoff || networkBackoff.isOpen) return []
    try {
      await assertUrlAllowedByWebRisk(feedUrl)
    } catch (err) {
      if (isHttpError(err) && err.status === 400) {
        await stampFetchOutcome(rssFeedId, { kind: 'skipped' })
        return []
      }
      throw err
    }
    if (!(await crawlableCheck(feedUrl, rssFeed))) {
      await stampFetchOutcome(rssFeedId, { kind: 'skipped' })
      return []
    }
    if (!(await networkBackoff.claimProbe())) return []
    const latestCrawlSummary = await getLatestRssFeedCrawlForFeedWithOptions(rssFeedId, {
      includeFeedData: false,
    })
    const options = buildRssFetchOptions(rssFeed, ttl, {
      canReplayFeedBody: latestCrawlSummary?.feed_data_sha256 != null,
    })
    let data: Awaited<ReturnType<typeof fetchCrawlerRss>>
    try {
      data = await fetchCrawlerRss(feedUrl, options)
      await recordRssFetchHostnameSuccess(fetchHostnameId)
    } catch (err) {
      if (await handleRssFetchRateLimitError(err, fetchHostnameId, feedUrl)) return []
      await recordRssFetchHostnameFailure(err, fetchHostnameId, dependencies.resolveDnsCanary)
      if (
        await fetchFailures.maybeSoftDeletePermanentFetchErrorForFetch({
          error: err,
          feedUrl,
          rssFeedId,
          policy: rssFeed,
          fetchHostnameId,
        })
      ) {
        skipFinalFailureStamp = true
      }
      throw err
    }
    const persistFetchResult = (
      params: Omit<
        Parameters<typeof persistRssFeedCrawlAndMetadata>[0],
        'rssFeedId' | 'currentMetadata'
      >,
    ) =>
      persistRssFeedCrawlAndMetadata({
        rssFeedId,
        currentMetadata: { etag: rssFeed.etag, lastModifiedAt: rssFeed.last_modified_at },
        ...params,
      })
    if ('redirect' in data && data.redirect) {
      const action = await handleRssFeedRedirect({
        rssFeedId,
        rssFeed: rssFeed as RssFeedToFetch,
        data,
        hopCount,
        maxHops: MAX_REDIRECT_HOPS,
        persistFetchResult,
      })
      if (action.type === 'follow') {
        skipFinalFailureStamp = true
        return await fetchRssFeed(
          rssFeedId,
          0,
          action.url,
          hopCount + 1,
          dependencies,
          fetchOptions,
        )
      }
      return []
    }
    const latestCrawl =
      data.responseCode === 304
        ? await getLatestRssFeedCrawlForFeedWithOptions(rssFeedId, { includeFeedData: true })
        : latestCrawlSummary
    const parsedFeed =
      data.feed ?? (data.responseCode === 304 ? (latestCrawl?.feed_data ?? null) : null)
    const contentSha256 =
      data.contentSha256 ??
      (data.responseCode === 304 ? (latestCrawl?.feed_data_sha256 ?? null) : null)
    if (parsedFeed == null || contentSha256 == null) {
      await persistFetchResult({ responseCode: data.responseCode, headers: data.headers })
      return []
    }
    const feedUnchanged = Boolean(
      latestCrawl?.feed_data_sha256 && latestCrawl.feed_data_sha256.equals(contentSha256),
    )
    const shouldPersistFeedData = data.responseCode !== 304
    const languageChanged = await persistFeedMetadataAndReconcileLanguage(
      rssFeedId,
      parsedFeed,
      rssFeed.title,
      rssFeed.declared_language,
      rssFeed.feed_type,
    )
    const validItems = feedUnchanged
      ? []
      : buildTrackedRssFeedItemsFromFeed(rssFeedId, parsedFeed, feedUrl)
    if (feedUnchanged || validItems.length === 0) {
      await persistFetchResult({
        responseCode: data.responseCode,
        headers: data.headers,
        feedData: shouldPersistFeedData ? parsedFeed : undefined,
        feedDataSha256: shouldPersistFeedData ? contentSha256 : undefined,
      })
      return []
    }
    const [items] = await Promise.all([
      upsertItems(rssFeedId, validItems, { redetectLanguage: languageChanged }),
      reclassifyRssFeedTypeIfNeeded(
        rssFeedId,
        { url: feedUrl, feed_type: rssFeed.feed_type },
        validItems,
      ),
    ])
    await persistFetchResult({
      responseCode: data.responseCode,
      headers: data.headers,
      feedData: shouldPersistFeedData ? parsedFeed : undefined,
      feedDataSha256: shouldPersistFeedData ? contentSha256 : undefined,
    })
    return items
  } catch (err) {
    if (!skipFinalFailureStamp) {
      await stampFetchOutcome(rssFeedId, { kind: 'error', isFinalAttempt }).catch(onError)
    }
    throw err
  }
}
