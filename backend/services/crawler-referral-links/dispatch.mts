import { executeHandlerWithCursorInBatches, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'
import { enqueueBulkCrawlReferralLinks } from '@queues/crawl-referral-links/enqueues'

const BATCH_SIZE = 1000

type EnqueueBulkCrawlReferralLinks = typeof enqueueBulkCrawlReferralLinks
type ComputeHostnameRateLimitMs = typeof computeHostnameRateLimitMs

type ReferralLinkDispatchDependencies = {
  enqueueBulkCrawlReferralLinks?: EnqueueBulkCrawlReferralLinks
  computeHostnameRateLimitMs?: ComputeHostnameRateLimitMs
}

type ScheduledReferralLinkDispatchOptions = ReferralLinkDispatchDependencies & {
  referralLinkIds?: readonly string[]
}

async function enqueueByHostname(
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

export async function dispatchReferralLinkCrawls(
  options: ScheduledReferralLinkDispatchOptions = {},
): Promise<number> {
  const queryStatement = sql`/* dispatchReferralLinkCrawls */
    SELECT urpl.id AS link_id, urpl.url_id, urpl.referral_program_id,
           h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM user_referral_program_links urpl
    JOIN urls u ON u.id = urpl.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE urpl.activated_at IS NOT NULL
      AND urpl.deactivated_at IS NULL
      AND urpl.deleted_at IS NULL
      AND h.crawlable IS DISTINCT FROM false
      AND h.blocked = false
      AND (urpl.last_crawl_success_at IS NULL OR urpl.last_crawl_success_at < NOW() - INTERVAL '7 days')
      AND (urpl.last_crawl_failure_at IS NULL OR urpl.last_crawl_failure_at < NOW() - INTERVAL '1 hour')
  `
  if (options.referralLinkIds !== undefined) {
    queryStatement.append(sql` AND urpl.id = ANY(${[...options.referralLinkIds]}::uuid[])`)
  }
  queryStatement.append(sql` ORDER BY h.id, urpl.id`)

  let total = 0
  await executeHandlerWithCursorInBatches<{
    link_id: string
    url_id: string
    referral_program_id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }>(queryStatement, undefined, {
    batchSize: BATCH_SIZE,
    readOnly: true,
    handler: async rows => {
      total += rows.length
      await enqueueByHostname(rows, {
        enqueueBulkCrawlReferralLinks:
          options.enqueueBulkCrawlReferralLinks ?? enqueueBulkCrawlReferralLinks,
        computeHostnameRateLimitMs:
          options.computeHostnameRateLimitMs ?? computeHostnameRateLimitMs,
      })
    },
  })
  return total
}

export async function enqueueReferralLinkCrawlsForUrlId(
  urlId: string,
  dependencies: ReferralLinkDispatchDependencies = {},
): Promise<number> {
  const { rows } = await read<{
    link_id: string
    url_id: string
    referral_program_id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }>(sql`/* enqueueReferralLinkCrawlsForUrlId */
    SELECT urpl.id AS link_id, urpl.url_id, urpl.referral_program_id,
           h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM user_referral_program_links urpl
    JOIN urls u ON u.id = urpl.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE urpl.url_id = ${urlId}
      AND urpl.activated_at IS NOT NULL
      AND urpl.deactivated_at IS NULL
      AND urpl.deleted_at IS NULL
      AND h.crawlable IS DISTINCT FROM false
      AND h.blocked = false
    ORDER BY h.id, urpl.id
  `)

  await enqueueByHostname(rows, {
    enqueueBulkCrawlReferralLinks:
      dependencies.enqueueBulkCrawlReferralLinks ?? enqueueBulkCrawlReferralLinks,
    computeHostnameRateLimitMs:
      dependencies.computeHostnameRateLimitMs ?? computeHostnameRateLimitMs,
  })
  return rows.length
}
