import { upsertRssFeedItems } from '@services/rss-feed-items'
import { updateRssFeedById } from './update.mts'
import { reclassifyRssFeedTypeIfNeeded } from './reclassify-feed-type.mts'
import {
  persistRssFeedCrawlAndMetadata,
  getLatestRssFeedCrawlForFeedWithOptions,
} from './crawls.mts'
import { isRssParseFeedError } from './is-permanent-fetch-error.mts'
import CrawlerRss from '@services/crawler-rss'
import { handleRssFeedRedirect } from './fetch-redirect.mts'
import { getRssFeedByIdToFetch, type RssFeedToFetch } from './get-to-fetch.mts'
import * as fetchFailures from './fetch-failures.mts'
import onError from '@modules/on-error'
import {
  CrawlerNetworkError,
  isCrawlerNetworkDnsError,
  isCrawlerNetworkTlsHostnameError,
} from '@modules/on-error/errors'
import { checkRssFeedCrawlable } from './fetch-robots-check.mts'
import {
  recordHostnameConfigurationFailure,
  recordHostnameDnsFailure,
  resetHostnameDnsFailures,
} from '@services/urls-hostnames/dns-failures'
import { getFetchHostnameId } from './fetch-hostname.mts'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'
import { isHttpError } from 'http-errors'
import { persistFeedMetadataAndReconcileLanguage } from './reconcile-item-language.mts'
import * as rssRateLimit from './domain-rate-limit.mts'
import { buildRssFetchOptions } from './fetch-options.mts'
import { buildTrackedRssFeedItemsFromFeed } from './fetch-items.mts'
import { rssFeedNeedsChapterMetadataBackfill } from './chapters-backfill.mts'
const MAX_REDIRECT_HOPS = 5
type FetchRssFeedDependencies = {
  checkRssFeedCrawlable: typeof checkRssFeedCrawlable
  crawlerRss: typeof CrawlerRss
  resolveDnsCanary: () => Promise<void>
}
export async function fetchRssFeed(
  rssFeedId: string,
  ttl: number = 60_000,
  overrideUrl: string | null = null,
  hopCount: number = 0,
  dependencies: Partial<FetchRssFeedDependencies> = {},
) {
  const crawlableCheck = dependencies.checkRssFeedCrawlable ?? checkRssFeedCrawlable
  const fetchCrawlerRss = dependencies.crawlerRss ?? CrawlerRss
  const rssFeed = await getRssFeedByIdToFetch(rssFeedId, { ttl })
  if (!rssFeed) return []
  const feedUrl = overrideUrl ?? rssFeed.url
  if (rssFeed.crawlable === false) {
    await updateRssFeedById(rssFeedId, { last_fetched_at: true })
    return []
  }
  const fetchHostnameId = await getFetchHostnameId(rssFeed.url_hostname_id, rssFeed.url, feedUrl)
  await rssRateLimit.assertRssFetchHostnameNotRateLimited(fetchHostnameId, feedUrl)
  try {
    await assertUrlAllowedByWebRisk(feedUrl)
  } catch (error) {
    if (!isHttpError(error) || error.status !== 400) throw error
    await updateRssFeedById(rssFeedId, { last_fetched_at: true })
    return []
  }
  if (!(await crawlableCheck(feedUrl, rssFeed))) {
    await updateRssFeedById(rssFeedId, { last_fetched_at: true })
    return []
  }
  const latestCrawlSummary = await getLatestRssFeedCrawlForFeedWithOptions(rssFeedId, {
    includeFeedData: false,
  })
  const options = buildRssFetchOptions(rssFeed, ttl, {
    canReplayFeedBody: latestCrawlSummary?.feed_data_sha256 != null,
  })
  let data: Awaited<ReturnType<typeof fetchCrawlerRss>>
  try {
    data = await fetchCrawlerRss(feedUrl, options)
    await resetHostnameDnsFailures(fetchHostnameId).catch(onError)
  } catch (err) {
    await rssRateLimit.lockRssFetchHostnameOnRateLimit(err, fetchHostnameId, feedUrl)
    if (err instanceof CrawlerNetworkError && isCrawlerNetworkDnsError(err)) {
      await recordHostnameDnsFailure(fetchHostnameId, dependencies.resolveDnsCanary).catch(onError)
    }
    if (err instanceof CrawlerNetworkError && isCrawlerNetworkTlsHostnameError(err)) {
      await recordHostnameConfigurationFailure(fetchHostnameId).catch(onError)
    }
    if (isRssParseFeedError(err)) {
      await resetHostnameDnsFailures(fetchHostnameId).catch(onError)
    }
    await fetchFailures.maybeSoftDeletePermanentFetchErrorForFetch({
      error: err,
      feedUrl,
      rssFeedId,
      policy: rssFeed,
      fetchHostnameId,
    })
    throw err
  }
  const persistFetchResult = (params: {
    responseCode: number
    headers: { etag: string | null; lastModified: string | null }
    feedData?: Record<string, unknown> | null
    feedDataSha256?: Buffer | null
    redirectUrlId?: string | null
  }) =>
    persistRssFeedCrawlAndMetadata({
      rssFeedId,
      responseCode: params.responseCode,
      headers: params.headers,
      feedData: params.feedData,
      feedDataSha256: params.feedDataSha256,
      redirectUrlId: params.redirectUrlId,
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
      return fetchRssFeed(rssFeedId, 0, action.url, hopCount + 1, dependencies)
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
    await persistFetchResult({
      responseCode: data.responseCode,
      headers: data.headers,
    })
    return []
  }
  const feedUnchanged =
    latestCrawl?.feed_data_sha256 != null
      ? latestCrawl.feed_data_sha256.equals(contentSha256)
      : false
  const shouldPersistFeedData = data.responseCode !== 304
  await persistFeedMetadataAndReconcileLanguage(
    rssFeedId,
    parsedFeed,
    rssFeed.title,
    rssFeed.declared_language,
    rssFeed.feed_type,
  )
  if (feedUnchanged) {
    const validItems = buildTrackedRssFeedItemsFromFeed(rssFeedId, parsedFeed, feedUrl)
    if (
      validItems.length > 0 &&
      (await rssFeedNeedsChapterMetadataBackfill(rssFeedId, validItems))
    ) {
      await upsertRssFeedItems(rssFeedId, validItems)
    }
    await persistFetchResult({
      responseCode: data.responseCode,
      headers: data.headers,
      feedData: shouldPersistFeedData ? parsedFeed : undefined,
      feedDataSha256: shouldPersistFeedData ? contentSha256 : undefined,
    })
    return []
  }
  const validItems = buildTrackedRssFeedItemsFromFeed(rssFeedId, parsedFeed, feedUrl)
  if (validItems.length === 0) {
    await persistFetchResult({
      responseCode: data.responseCode,
      headers: data.headers,
      feedData: parsedFeed,
      feedDataSha256: contentSha256,
    })
    return []
  }

  const [items] = await Promise.all([
    upsertRssFeedItems(rssFeedId, validItems),
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
}
