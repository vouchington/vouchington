import onError from '@modules/on-error'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { addUrl, setCanonicalUrl } from '@services/urls'
import { CircularCanonicalReferenceError } from '@services/urls/set-canonical'
import { updateCrawl } from '../update.mts'
import { safeResolveUrl } from '../crawl-url-utils.mts'
import type {
  CrawlHtmlFetchResult,
  CrawlUrlOptions,
  CrawlUrlRecord,
  CrawlUrlRunner,
  RedirectResult,
} from './types.mts'

const redirectStatusRecordedErrors = new WeakSet<object>()

export async function handleCrawlRedirect(params: {
  crawlId: string
  htmlResult: CrawlHtmlFetchResult
  options?: CrawlUrlOptions
  runCrawlUrl: CrawlUrlRunner
  url: CrawlUrlRecord
  visitedUrls: Set<string>
  hopCount: number
}): Promise<RedirectResult> {
  const { crawlId, htmlResult, options, runCrawlUrl, url, visitedUrls, hopCount } = params
  const isPermanentRedirect = [301, 308].includes(htmlResult.response_status_code)
  const isTemporaryRedirect = [302, 303, 307].includes(htmlResult.response_status_code)
  const location = htmlResult.response_headers['location']

  if ((!isPermanentRedirect && !isTemporaryRedirect) || !location) {
    return { handled: false, statusRecorded: false }
  }

  const redirectUrl = safeResolveUrl(location, url.url)
  if (!redirectUrl || redirectUrl === url.url) {
    const crawl = await recordRedirectStatus(crawlId, url.id, htmlResult)
    return { crawl, handled: true, statusRecorded: false }
  }

  const redirectUrlEntry = await addUrl(null, redirectUrl, {
    preserveHttp: options?.preserveHttpRedirects === true,
    skipCreatedEvents: options?.skipCreatedEventsForRedirects === true,
  })
  if (!redirectUrlEntry || redirectUrlEntry.id === url.id) {
    const crawl = await recordRedirectStatus(crawlId, url.id, htmlResult)
    return { crawl, handled: true, statusRecorded: false }
  }

  const redirectCrawl = await updateCrawl(crawlId, url.id, {
    redirect_url_id: redirectUrlEntry.id,
    request_headers: htmlResult.request_headers,
    response_headers: htmlResult.response_headers,
    response_status_code: htmlResult.response_status_code,
    completed_at: htmlResult.crawl_completed_at,
  })

  if (isPermanentRedirect) {
    await trySetCanonicalUrl(url.id, redirectUrlEntry.id)
  }

  if (options?.ensureCrawlerForRedirects === true) {
    await getOrCreateCrawlerForHostname(null, redirectUrlEntry.hostname.id)
  }

  const redirectResult = await runCrawlUrl(
    redirectUrlEntry.id,
    hopCount + 1,
    visitedUrls,
    options,
  ).catch((err: unknown) => {
    throw markRedirectStatusRecorded(err)
  })
  return {
    crawl: redirectResult || redirectCrawl,
    handled: true,
    statusRecorded: true,
  }
}

function recordRedirectStatus(crawlId: string, urlId: string, htmlResult: CrawlHtmlFetchResult) {
  return updateCrawl(crawlId, urlId, {
    request_headers: htmlResult.request_headers,
    response_headers: htmlResult.response_headers,
    response_status_code: htmlResult.response_status_code,
    completed_at: htmlResult.crawl_completed_at,
  })
}

export function hasRedirectStatusRecorded(error: unknown) {
  return isWeakSetKey(error) && redirectStatusRecordedErrors.has(error)
}

function markRedirectStatusRecorded(error: unknown) {
  if (isWeakSetKey(error)) {
    redirectStatusRecordedErrors.add(error)
  }
  return error
}

function isWeakSetKey(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

export async function trySetCanonicalUrl(urlId: string, canonicalUrlId: string) {
  try {
    await setCanonicalUrl(urlId, canonicalUrlId)
  } catch (err) {
    if (!(err instanceof CircularCanonicalReferenceError)) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
}
