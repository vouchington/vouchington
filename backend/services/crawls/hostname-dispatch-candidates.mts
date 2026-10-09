import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CrawlHostnameDispatchCursor } from '@queues/crawl-hostnames/types'

export type HostnameDispatchCandidate = {
  id: string
  range: 0 | 1
  crawl_swept_at: Date | null
}

/** Seek one distinct leading index value rather than scan all hosts to enumerate thresholds. */
export async function getNextCrawlHostnameBucket(afterDays: number) {
  const { rows } = await read<{ age_threshold_days: number }>(sql`/* nextCrawlHostnameBucket */
    SELECT age_threshold_days FROM url_hostnames
    WHERE is_crawlable AND NOT is_blocked AND age_threshold_days > ${afterDays}::integer
    ORDER BY age_threshold_days LIMIT 1
  `)
  return rows[0]?.age_threshold_days
}

export async function getCrawlHostnameCandidates(
  cursor: CrawlHostnameDispatchCursor & { bucketDays: number },
  remaining: number,
) {
  const never = sql`
    SELECT id, 0 AS range, crawl_swept_at
    FROM url_hostnames uh
    WHERE uh.is_crawlable AND NOT uh.is_blocked
      AND uh.age_threshold_days = ${cursor.bucketDays}
      AND uh.crawl_swept_at IS NULL
  `
  const overdue = sql`
    SELECT id, 1 AS range, crawl_swept_at
    FROM url_hostnames uh
    WHERE uh.is_crawlable AND NOT uh.is_blocked
      AND uh.age_threshold_days = ${cursor.bucketDays}
      AND uh.crawl_swept_at < ${cursor.sweepStartedAt}::timestamptz
        - ${cursor.bucketDays}::integer * INTERVAL '1 day'
  `
  for (const branch of [never, overdue]) {
    branch.append(sql` AND NOT EXISTS (
      SELECT 1 FROM blocklisted_domains db
      JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
      WHERE db.domain = uh.hostname AND dbs.type = 'url'::domain_blocklist_types
    )`)
  }
  if (cursor.afterId && cursor.range === 0) never.append(sql` AND uh.id > ${cursor.afterId}::uuid`)
  if (cursor.afterId && cursor.afterSweptAt && cursor.range === 1)
    overdue.append(sql` AND (uh.crawl_swept_at, uh.id)
      > (${cursor.afterSweptAt}::timestamptz, ${cursor.afterId}::uuid)`)
  const currentRemaining = Math.max(0, cursor.rangeLimit - (cursor.rangeRows ?? 0))
  never.append(
    sql` ORDER BY uh.crawl_swept_at NULLS FIRST, uh.id LIMIT ${cursor.range === 1 ? 0 : currentRemaining}`,
  )
  overdue.append(sql` ORDER BY uh.crawl_swept_at NULLS FIRST, uh.id
    LIMIT ${cursor.range === 1 ? currentRemaining : cursor.rangeLimit}`)
  // Each input range stops in index order. This final ordering touches only the two capped pages.
  const statement = sql`/* dispatchCrawlHostnames */ SELECT * FROM (`
  statement.append('(').append(never).append(') UNION ALL (').append(overdue).append(')')
  statement.append(sql`) due ORDER BY crawl_swept_at NULLS FIRST, id LIMIT ${remaining}`)
  return (await read<HostnameDispatchCandidate>(statement)).rows
}
