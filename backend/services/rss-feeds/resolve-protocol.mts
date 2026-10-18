import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { fetchAndClassifyFeed, type FeedClassification } from './validate.mts'
import { RssFeedDiscoveryPendingError } from './discovery-pending.mts'
import type CrawlerRss from '@services/crawler-rss'

type ResolveProtocolOptions = {
  beforeFetch?: (url: string) => Promise<void>
  fetchAndClassifyFeedImpl?: typeof fetchAndClassifyFeed
  importRowId?: string
  crawlerRssOptions?: Parameters<typeof CrawlerRss>[1]
  /** Aborts the fetch, and stops the HTTP fallback from starting once the budget is spent. */
  signal?: AbortSignal
}

export async function resolveProtocolAndClassify(
  rssFeedUrl: string,
  options: ResolveProtocolOptions = {},
): Promise<{ resolvedUrl: string; classification: FeedClassification }> {
  const fetchAndClassifyFeedImpl = options.fetchAndClassifyFeedImpl ?? fetchAndClassifyFeed
  const { signal } = options
  const fetchAndClassifyFeedFn = (url: string) =>
    fetchAndClassifyFeedImpl(url, {
      signal,
      importRowId: options.importRowId,
      crawlerRssOptions: options.crawlerRssOptions,
    })

  // Use the WHATWG-parsed protocol so uppercase schemes (HTTP://) are handled correctly
  const protocol = new URL(rssFeedUrl).protocol
  if (protocol !== 'http:') {
    await options.beforeFetch?.(rssFeedUrl)
    return { resolvedUrl: rssFeedUrl, classification: await fetchAndClassifyFeedFn(rssFeedUrl) }
  }
  // normalizeUrlForUrlTable upgrades http→https and clears port 80, giving the canonical HTTPS URL
  const httpsUrl = normalizeUrlForUrlTable(rssFeedUrl).toString()
  await options.beforeFetch?.(httpsUrl)
  try {
    const classification = await fetchAndClassifyFeedFn(httpsUrl)
    // If HTTPS redirects back to an http:// URL the server doesn't truly support HTTPS;
    // fall through to the HTTP fallback below.
    // Use startsWith rather than URL.protocol to handle relative redirect locations safely.
    if (
      classification.kind === 'redirect' &&
      classification.location.toLowerCase().startsWith('http://')
    ) {
      throw new Error('HTTPS redirects to HTTP')
    }
    return { resolvedUrl: httpsUrl, classification }
  } catch (err) {
    if (err instanceof RssFeedDiscoveryPendingError) throw err
    // A spent budget is not an HTTPS failure: do not spend more of it on the HTTP fallback.
    if (signal?.aborted) throw err
    const httpUrl = normalizeUrlForUrlTable(rssFeedUrl, { preserveHttp: true }).href
    await options.beforeFetch?.(httpUrl)
    const classification = await fetchAndClassifyFeedFn(httpUrl)
    return { resolvedUrl: httpUrl, classification }
  }
}
