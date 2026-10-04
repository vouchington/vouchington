import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'
import { enqueueBulkCrawlReferralLinks } from '@queues/crawl-referral-links/enqueues'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'

type ReferralLinkDispatchDependencies = {
  enqueueBulkCrawlReferralLinks: typeof enqueueBulkCrawlReferralLinks
  computeHostnameRateLimitMs: typeof computeHostnameRateLimitMs
}

export async function enqueueByHostname(
  rows: {
    link_id: string
    url_id: string
    referral_program_id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }[],
  dependencies: Required<ReferralLinkDispatchDependencies>,
): Promise<void> {
  const byHostname = new Map<
    string,
    {
      entries: { linkId: string; urlId: string; referralProgramId: string }[]
      hostname: string
      requestsPerSecondLimit: number | null
    }
  >()
  for (const row of rows) {
    const group = byHostname.get(row.hostname_id) ?? {
      entries: [],
      hostname: row.hostname,
      requestsPerSecondLimit: row.requests_per_second_limit,
    }
    group.entries.push({
      linkId: row.link_id,
      urlId: row.url_id,
      referralProgramId: row.referral_program_id,
    })
    byHostname.set(row.hostname_id, group)
  }
  for (const [hostnameId, { entries, hostname, requestsPerSecondLimit }] of byHostname) {
    let rateLimitMs: number | undefined
    try {
      // oxlint-disable-next-line no-await-in-loop -- serialize robots checks to preserve provider backpressure across hostnames
      rateLimitMs = await dependencies.computeHostnameRateLimitMs(
        hostname,
        requestsPerSecondLimit,
        CRAWLER_USER_AGENT,
      )
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
    // oxlint-disable-next-line no-await-in-loop -- awaited dispatch preserves hostname queue backpressure
    await dependencies.enqueueBulkCrawlReferralLinks(entries, { hostnameId, rateLimitMs })
  }
}
