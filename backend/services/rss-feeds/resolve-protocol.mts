import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { fetchAndClassifyFeed, type FeedClassification } from './validate.mts'

type ResolveProtocolOptions = {
  beforeFetch?: (url: string) => Promise<void>
  fetchAndClassifyFeedImpl?: typeof fetchAndClassifyFeed
}

export async function resolveProtocolAndClassify(
  rssFeedUrl: string,
  options: ResolveProtocolOptions = {},
): Promise<{ resolvedUrl: string; classification: FeedClassification }> {
  const fetchAndClassifyFeedFn = options.fetchAndClassifyFeedImpl ?? fetchAndClassifyFeed

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
  } catch {
    const httpUrl = normalizeUrlForUrlTable(rssFeedUrl, { preserveHttp: true }).href
    await options.beforeFetch?.(httpUrl)
    const classification = await fetchAndClassifyFeedFn(httpUrl)
    return { resolvedUrl: httpUrl, classification }
  }
}
