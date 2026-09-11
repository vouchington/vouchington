import { CRAWLER_USER_AGENT } from '@voucha/config'
import { getCrawlerForHostnameId } from '@services/crawlers'
import { applyCrawlerRules } from '@services/crawlers/apply-rules'
import { isUrlCrawlable } from '@services/urls-domains-robots'
import { getUrlById } from '@services/urls/get'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import net from 'node:net'
import { isPrivateIp } from 'ssrf-guard'
import onError from '@modules/on-error'
import { trackDomainRateLimitDeferred } from '@services/analytics'
import { CrawlerRateLimitError } from '@modules/on-error/errors'
import { createCrawl } from '../create.mts'
import { getLatestHtmlSnapshotCrawl } from '../get.mts'
import { getDomainRateLimitRemainingMs } from '../domain-rate-limit.mts'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'
import { isHttpError } from 'http-errors'
import { isSnapshotReusable } from '../crawl-url-utils.mts'
import type { CrawlUrlOptions } from './types.mts'

export const MAX_REDIRECT_HOPS = 10

export async function loadCrawlPreflight(
  urlId: string,
  hopCount: number,
  visitedUrls: Set<string>,
  options?: Pick<CrawlUrlOptions, 'dependencies' | 'ignoreRobotsTxt'>,
) {
  const dependencies = options?.dependencies
  const url = (await getUrlById(urlId)) ?? (await getUrlById(urlId, { readOnly: false }))
  if (!url) {
    return null
  }

  if (visitedUrls.has(url.url) || hopCount >= MAX_REDIRECT_HOPS) {
    return null
  }
  visitedUrls.add(url.url)

  const hostname =
    (await getUrlHostnameCrawlerDetailsById(url.hostname.id)) ??
    (await getUrlHostnameCrawlerDetailsById(url.hostname.id, { readOnly: false }))
  if (!hostname) {
    return null
  }
  if (hostname.blocked || hostname.crawlable === false || isLocalHostname(hostname.hostname)) {
    return null
  }

  const rateLimitRemainingMs = await getDomainRateLimitRemainingMs(hostname.id)
  if (rateLimitRemainingMs !== null) {
    trackDomainRateLimitDeferred('html', hostname.hostname, rateLimitRemainingMs)
    throw new CrawlerRateLimitError(url.url, 429, 0, rateLimitRemainingMs)
  }

  try {
    await assertUrlAllowedByWebRisk(url.url)
  } catch (error) {
    if (isHttpError(error) && error.status === 400) return null
    throw error
  }

  if (options?.ignoreRobotsTxt !== true) {
    const checkUrlCrawlable = dependencies?.isUrlCrawlable ?? isUrlCrawlable
    const isCrawlable = await checkUrlCrawlable(url.url, CRAWLER_USER_AGENT).catch(err => {
      onError(err)
      return false
    })
    if (!isCrawlable) return null
  }

  const crawler = await getCrawlerForHostnameId(url.hostname.id)
  if (!crawler) return null

  const previousCrawl = await getLatestHtmlSnapshotCrawl(url.id)
  const previousHtmlSha256 = previousCrawl?.html_sha256 || null
  const previousHtmlSnapshotUploadedAt =
    previousCrawl?.html_snapshot_uploaded_at || previousCrawl?.completed_at || null
  const previousSnapshotReusable = isSnapshotReusable(
    previousHtmlSha256,
    previousHtmlSnapshotUploadedAt,
    new Date(),
  )
  const crawl = await createCrawl(url.id, crawler.id, {
    last_modified_at: previousCrawl?.last_modified_at || null,
    etag: previousCrawl?.etag || null,
  })

  return {
    crawl,
    crawlerOptions: applyCrawlerRules(crawler),
    etag: previousSnapshotReusable ? previousCrawl?.etag || undefined : undefined,
    hostname,
    lastModifiedAt: previousSnapshotReusable
      ? previousCrawl?.last_modified_at?.toISOString()
      : undefined,
    previousHtmlSha256,
    previousHtmlSnapshotUploadedAt,
    url,
  }
}

function isLocalHostname(hostname: string) {
  const hostnameStr = hostname.replace(/\.+$/, '').replace(/^\[(.+)\]$/, '$1')
  return (
    hostnameStr === 'localhost' ||
    hostnameStr.endsWith('.local') ||
    (net.isIP(hostnameStr) !== 0 && isPrivateIp(hostnameStr))
  )
}
