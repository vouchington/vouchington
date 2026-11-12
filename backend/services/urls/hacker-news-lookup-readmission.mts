import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import { areHackerNewsLookupsEnabled, hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { enqueueHackerNewsLookups } from '@queues/hacker-news/enqueues'
import type { LookupReadmissionKey, LookupReadmissionWindow } from '@queues/hacker-news-flags/types'
import { getHackerNewsWorkLimit, hackerNewsWorkConfig } from './hacker-news-work-limits.mts'
import {
  getHackerNewsLookupTargets,
  getHackerNewsRefreshDelay,
  isHackerNewsLookupDue,
} from './hacker-news-lookup-state.mts'

/** Resume known refreshes through a frozen due window, never historical initial admission. */
export async function readmitHackerNewsLookupPage(
  {
    after,
    window,
    urlIds,
    now = Date.now(),
  }: {
    after?: LookupReadmissionKey
    window?: LookupReadmissionWindow
    urlIds?: readonly string[]
    now?: number
  },
  options: QueryOptions = {},
): Promise<{
  after: LookupReadmissionKey | undefined
  window: LookupReadmissionWindow | undefined
  hasMore: boolean
  admittedIds: string[]
}> {
  const sweep = await prepareHackerNewsLookupReadmissionWindow(window, now)
  if (!sweep) return { after, window, hasMore: false, admittedIds: [] }
  const size = getHackerNewsWorkLimit('lookup_batch_size')
  const body = buildHackerNewsReadmissionPageQueryBody(sweep, after, urlIds)
  const query = sql`/* readmitHackerNewsLookupPage */
    `
  query.append(body)
  const { rows } = await read<{ url_id: string; cursor_looked_up_at: string }>(
    query,
    undefined,
    options,
  )
  const targets = await getHackerNewsLookupTargets(
    rows.map(row => row.url_id),
    options,
  )
  const admittedIds = targets.flatMap(target =>
    target.looked_up_at &&
    getHackerNewsRefreshDelay(target, sweep.decisionInstant) !== null &&
    isHackerNewsLookupDue(target, sweep.decisionInstant)
      ? [target.id]
      : [],
  )
  // This is best-effort admission; a removed or failed lookup can be retried by the next sweep.
  await enqueueHackerNewsLookups(admittedIds)
  const last = rows.at(-1)
  return {
    after: last ? { lookedUpAt: last.cursor_looked_up_at, urlId: last.url_id } : after,
    window: sweep,
    hasMore: rows.length === size,
    admittedIds,
  }
}

/** Freeze before page I/O so retained jobs can persist the same ceiling before a retry. */
export async function prepareHackerNewsLookupReadmissionWindow(
  window?: LookupReadmissionWindow,
  now = Date.now(),
): Promise<LookupReadmissionWindow | undefined> {
  await Promise.all([
    hackerNewsQueueConfig.waitForInitialization(),
    hackerNewsWorkConfig.waitForInitialization(),
  ])
  if (!areHackerNewsLookupsEnabled()) return undefined
  if (window) return window
  const shortestHours = Math.min(
    getHackerNewsWorkLimit('recent_refresh_hours'),
    getHackerNewsWorkLimit('middle_refresh_hours'),
    getHackerNewsWorkLimit('older_refresh_hours'),
  )
  return {
    decisionInstant: now,
    cutoff: new Date(now - shortestHours * 3_600_000).toISOString(),
  }
}

/** The leading timestamp predicate and tuple key use the existing freshness index. */
export function buildHackerNewsReadmissionPageQuery(
  window: LookupReadmissionWindow,
  after?: LookupReadmissionKey,
  urlIds?: readonly string[],
): SQLStatement {
  return sql`/* readmitHackerNewsLookupPage */
    `.append(buildHackerNewsReadmissionPageQueryBody(window, after, urlIds))
}

function buildHackerNewsReadmissionPageQueryBody(
  window: LookupReadmissionWindow,
  after?: LookupReadmissionKey,
  urlIds?: readonly string[],
): SQLStatement {
  const query = sql`SELECT url_id, looked_up_at::text AS cursor_looked_up_at
    FROM url_hacker_news_totals
    WHERE looked_up_at <= ${window.cutoff}::timestamptz`
  if (after)
    query.append(sql`
    AND (looked_up_at, url_id) > (${after.lookedUpAt}::timestamptz, ${after.urlId}::uuid)`)
  if (urlIds) query.append(sql` AND url_id = ANY(${urlIds}::uuid[])`)
  return query.append(sql`
    ORDER BY looked_up_at, url_id LIMIT ${getHackerNewsWorkLimit('lookup_batch_size')}`)
}
