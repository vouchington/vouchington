import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'

export async function enqueueByHostname(
  rows: {
    id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }[],
): Promise<void> {
  const byHostname = new Map<
    string,
    { urlIds: string[]; hostname: string; requestsPerSecondLimit: number | null }
  >()
  for (const row of rows) {
    const group = byHostname.get(row.hostname_id) ?? {
      urlIds: [],
      hostname: row.hostname,
      requestsPerSecondLimit: row.requests_per_second_limit,
    }
    group.urlIds.push(row.id)
    byHostname.set(row.hostname_id, group)
  }
  // Process hostnames serially to avoid a thundering herd of concurrent robots.txt fetches.
  // This is acceptable because robots.txt responses are cached in Valkey for 24 hours, so only
  // the first job per hostname actually fetches robots.txt. Subsequent jobs for the same hostname
  // within the TTL use the cached result.
  // Fall back to undefined (default rate limit) if robots.txt fetch fails.
  for (const [hostnameId, { urlIds, hostname, requestsPerSecondLimit }] of byHostname) {
    let rateLimitMs: number | undefined
    try {
      // oxlint-disable-next-line no-await-in-loop -- serialize robots checks to avoid a cross-hostname request burst
      rateLimitMs = await computeHostnameRateLimitMs(
        hostname,
        requestsPerSecondLimit,
        CRAWLER_USER_AGENT,
      )
    } catch (err) {
      // Log unexpected errors from robots.txt fetch for observability
      onError(err instanceof Error ? err : new Error(String(err)))
    }
    // oxlint-disable-next-line no-await-in-loop -- preserve queue backpressure before dispatching the next hostname
    await enqueueBulkCrawlUrls(
      urlIds.map(urlId => ({ urlId })),
      { hostnameId, rateLimitMs },
    )
  }
}
