import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'

/**
 * Compute the rate limit for a hostname in milliseconds.
 * Returns undefined if the hostname is not found or on error.
 */
export async function computeRateLimitForHostname(hostnameId: string): Promise<number | undefined> {
  try {
    const hostnameDetails = await getUrlHostnameCrawlerDetailsById(hostnameId)
    if (hostnameDetails) {
      return await computeHostnameRateLimitMs(
        hostnameDetails.hostname,
        hostnameDetails.requests_per_second_limit,
        CRAWLER_USER_AGENT,
      )
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
  return undefined
}
