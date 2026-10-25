import onError from '@modules/on-error'
import {
  CrawlerNetworkError,
  isCrawlerNetworkDnsError,
  isCrawlerNetworkTlsHostnameError,
} from '@modules/on-error/errors'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import {
  recordHostnameConfigurationFailure,
  recordHostnameDnsFailure,
} from '@services/urls-hostnames/dns-failures'
import {
  isHostnameAnsweredError,
  isHostnameUnreachableError,
  isOutsideHostnameNetworkBackoff,
  recordHostnameNetworkFailure,
  resetHostnameFailures,
} from '@services/urls-hostnames/network-backoff'
import { isRssParseFeedError } from './is-permanent-fetch-error.mts'

/** Whether the fetch hostname is in a network backoff, claiming the probe when it has expired. */
export async function isRssFetchHostnameInNetworkBackoff(fetchHostnameId: string) {
  const hostname = await getUrlHostnameCrawlerDetailsById(fetchHostnameId)
  if (!hostname) return false
  return !(await isOutsideHostnameNetworkBackoff(hostname))
}

/** A fetched feed proves the hostname resolves and answers. */
export async function recordRssFetchHostnameSuccess(fetchHostnameId: string) {
  await resetHostnameFailures(fetchHostnameId, { crawlerType: 'rss', includeDns: true }).catch(
    onError,
  )
}

/** Routes a failed fetch to the hostname's DNS/configuration latch or network backoff. */
export async function recordRssFetchHostnameFailure(
  failure: unknown,
  fetchHostnameId: string,
  resolveDnsCanary: (() => Promise<void>) | undefined,
) {
  if (failure instanceof CrawlerNetworkError && isCrawlerNetworkDnsError(failure)) {
    await recordHostnameDnsFailure(fetchHostnameId, resolveDnsCanary).catch(onError)
  }
  if (failure instanceof CrawlerNetworkError && isCrawlerNetworkTlsHostnameError(failure)) {
    await recordHostnameConfigurationFailure(fetchHostnameId).catch(onError)
  }
  if (isHostnameUnreachableError(failure)) {
    await recordHostnameNetworkFailure(fetchHostnameId, 'rss').catch(onError)
  }
  if (isRssParseFeedError(failure) || isHostnameAnsweredError(failure)) {
    // The hostname answered; a parse failure also proves DNS resolved.
    const includeDns = isRssParseFeedError(failure)
    await resetHostnameFailures(fetchHostnameId, { crawlerType: 'rss', includeDns }).catch(onError)
  }
}
