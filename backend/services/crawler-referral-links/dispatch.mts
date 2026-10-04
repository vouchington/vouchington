import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'
import {
  enqueueBulkCrawlReferralLinks,
  enqueueCrawlReferralLinksDispatcher,
} from '@queues/crawl-referral-links/enqueues'

import { getDispatchLimits } from './work-limits.mts'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import type { ReferralCrawlDispatchCursor } from '@queues/crawl-referral-links/types'

type EnqueueBulkCrawlReferralLinks = typeof enqueueBulkCrawlReferralLinks
type ComputeHostnameRateLimitMs = typeof computeHostnameRateLimitMs

type ReferralLinkDispatchDependencies = {
  enqueueBulkCrawlReferralLinks?: EnqueueBulkCrawlReferralLinks
  computeHostnameRateLimitMs?: ComputeHostnameRateLimitMs
}

type ScheduledReferralLinkDispatchOptions = ReferralLinkDispatchDependencies & {
  referralLinkIds?: readonly string[]
  cursor?: ReferralCrawlDispatchCursor
  urlId?: string
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
) {
  const limits = getDispatchLimits()
  const sweepStartedAt = options.cursor?.sweepStartedAt ?? new Date().toISOString()
  const upperId = getMaxUUIDv7ForDate(new Date(sweepStartedAt))
  const queryStatement = sql`/* dispatchReferralLinkCrawls */
    SELECT urpl.id AS link_id, urpl.url_id, urpl.referral_program_id,
           h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM user_referral_program_links urpl
    JOIN urls u ON u.id = urpl.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE urpl.id <= ${upperId}::uuid
      AND (${options.cursor?.afterId ?? null}::uuid IS NULL OR urpl.id > ${options.cursor?.afterId ?? null}::uuid)
      AND urpl.activated_at IS NOT NULL
      AND urpl.deactivated_at IS NULL
      AND urpl.deleted_at IS NULL
      AND h.crawlable IS DISTINCT FROM false
      AND h.blocked = false

  `
  if (options.urlId) queryStatement.append(sql` AND urpl.url_id = ${options.urlId}::uuid`)
  else
    queryStatement.append(sql`
      AND (urpl.last_crawl_success_at IS NULL OR urpl.last_crawl_success_at < ${sweepStartedAt}::timestamptz - INTERVAL '7 days')
      AND (urpl.last_crawl_failure_at IS NULL OR urpl.last_crawl_failure_at < ${sweepStartedAt}::timestamptz - INTERVAL '1 hour')`)
  if (options.referralLinkIds !== undefined) {
    queryStatement.append(sql` AND urpl.id = ANY(${[...options.referralLinkIds]}::uuid[])`)
  }
  queryStatement.append(sql` ORDER BY urpl.id`)

  let total = 0
  const result = await executeHandlerWithCursorInBatches<{
    link_id: string
    url_id: string
    referral_program_id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }>(queryStatement, undefined, {
    batchSize: limits.batchSize,
    maxRows: limits.maxRows,
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
  if (result.hasMore && result.lastRow)
    await enqueueCrawlReferralLinksDispatcher({
      cursor: { sweepStartedAt, afterId: result.lastRow.link_id },
      ...(options.urlId ? { urlId: options.urlId } : {}),
      ...(options.referralLinkIds ? { referralLinkIds: options.referralLinkIds } : {}),
    })
  return { count: total, hasMore: result.hasMore }
}

/** Event fanout preserves its URL scope and bypasses scheduled crawl cooldowns. */
export async function enqueueReferralLinkCrawlsForUrlId(
  urlId: string,
  dependencies: ReferralLinkDispatchDependencies = {},
) {
  return dispatchReferralLinkCrawls({ ...dependencies, urlId })
}
