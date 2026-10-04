import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueByHostname } from './dispatch-hostnames.mts'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
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

export async function dispatchReferralLinkCrawls(
  options: ScheduledReferralLinkDispatchOptions = {},
) {
  const limits = getDispatchLimits()
  const sweepStartedAt = options.cursor?.sweepStartedAt ?? new Date().toISOString()
  const upperId = getMaxUUIDv7ForDate(new Date(sweepStartedAt))
  const queryStatement = sql`/* dispatchReferralLinkCrawls */
    WITH due_candidates AS MATERIALIZED (
      SELECT id, url_id, referral_program_id, last_crawl_failure_at,
             COALESCE(last_crawl_success_at, '-infinity'::timestamptz) AS due_at
      FROM user_referral_program_links
      WHERE id <= ${upperId}::uuid
        AND activated_at IS NOT NULL AND deactivated_at IS NULL AND deleted_at IS NULL
  `
  if (options.urlId) {
    queryStatement.append(sql` AND url_id = ${options.urlId}::uuid`)
    if (options.cursor?.afterId)
      queryStatement.append(sql` AND id > ${options.cursor.afterId}::uuid`)
  } else {
    queryStatement.append(sql` AND COALESCE(last_crawl_success_at, '-infinity'::timestamptz)
      < ${sweepStartedAt}::timestamptz - INTERVAL '7 days'`)
    if (options.cursor?.afterWork)
      queryStatement.append(sql` AND (COALESCE(last_crawl_success_at, '-infinity'::timestamptz), id)
        > (${options.cursor.afterWork.dueAt}::timestamptz, ${options.cursor.afterWork.id}::uuid)`)
  }
  if (options.referralLinkIds !== undefined)
    queryStatement.append(sql` AND id = ANY(${[...options.referralLinkIds]}::uuid[])`)
  queryStatement.append(
    options.urlId
      ? ' ORDER BY id'
      : " ORDER BY COALESCE(last_crawl_success_at, '-infinity'::timestamptz), id",
  )
  queryStatement.append(sql` LIMIT ${limits.maxRows + 1}
    ) SELECT c.id AS link_id, c.url_id, c.referral_program_id, c.due_at::text AS due_at,
      h.id AS hostname_id, h.hostname, h.requests_per_second_limit,
      (h.crawlable IS DISTINCT FROM false AND h.blocked = false) AS host_eligible,
      (c.last_crawl_failure_at IS NULL OR c.last_crawl_failure_at
        < ${sweepStartedAt}::timestamptz - INTERVAL '1 hour') AS retry_eligible
    FROM due_candidates c JOIN urls u ON u.id = c.url_id JOIN url_hostnames h ON h.id = u.hostname_id`)
  queryStatement.append(options.urlId ? ' ORDER BY c.id' : ' ORDER BY c.due_at, c.id')

  let total = 0
  const result = await executeHandlerWithCursorInBatches<{
    link_id: string
    url_id: string
    referral_program_id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
    due_at: string
    host_eligible: boolean
    retry_eligible: boolean
  }>(queryStatement, undefined, {
    batchSize: limits.batchSize,
    maxRows: limits.maxRows,
    readOnly: true,
    handler: async rows => {
      const eligible = rows.filter(
        row => row.host_eligible && (options.urlId || row.retry_eligible),
      )
      total += eligible.length
      await enqueueByHostname(eligible, {
        enqueueBulkCrawlReferralLinks:
          options.enqueueBulkCrawlReferralLinks ?? enqueueBulkCrawlReferralLinks,
        computeHostnameRateLimitMs:
          options.computeHostnameRateLimitMs ?? computeHostnameRateLimitMs,
      })
    },
  })
  if (result.hasMore && result.lastRow)
    await enqueueCrawlReferralLinksDispatcher({
      cursor: {
        sweepStartedAt,
        ...(options.urlId
          ? { afterId: result.lastRow.link_id }
          : {
              afterWork: { dueAt: result.lastRow.due_at, id: result.lastRow.link_id },
            }),
      },
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
