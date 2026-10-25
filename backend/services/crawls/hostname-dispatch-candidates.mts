import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import type { CrawlHostnameDispatchCursor } from '@queues/crawl-dispatch/types'

export type HostnameDispatchCandidate = {
  id: string
  has_url: boolean
  is_due: boolean
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
  const statement = sql`/* dispatchCrawlHostnames */
    SELECT id,
      (crawl_swept_at IS NULL OR crawl_swept_at < ${cursor.sweepStartedAt}::timestamptz
        - ${cursor.bucketDays}::integer * INTERVAL '1 day') AS is_due,
      EXISTS (SELECT 1 FROM urls WHERE urls.hostname_id = uh.id) AS has_url
    FROM url_hostnames uh
    WHERE uh.is_crawlable AND NOT uh.is_blocked
      AND (uh.network_backoff_until IS NULL
        OR uh.network_backoff_until <= CURRENT_TIMESTAMP)
      AND uh.age_threshold_days = ${cursor.bucketDays}
      AND uh.id < ${getMinUUIDv7ForDate(new Date(cursor.sweepStartedAt))}::uuid
`
  if (cursor.afterId) statement.append(sql` AND uh.id > ${cursor.afterId}::uuid`)
  statement.append(sql` ORDER BY uh.id LIMIT ${remaining}`)
  return (await read<HostnameDispatchCandidate>(statement)).rows
}
