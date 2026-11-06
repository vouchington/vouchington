import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { areHackerNewsLookupsEnabled, hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { enqueueHackerNewsLookups } from '@queues/hacker-news/enqueues'
import { getHackerNewsWorkLimit, hackerNewsWorkConfig } from './hacker-news-work-limits.mts'
import {
  getHackerNewsLookupTargets,
  getHackerNewsRefreshDelay,
  isHackerNewsLookupDue,
} from './hacker-news-lookup-state.mts'

/** Resume only known refreshes: pausing initial URL creation does not create historical catch-up. */
export async function readmitHackerNewsLookupPage({
  afterId,
  upperId,
  urlIds,
  now = Date.now(),
}: {
  afterId: string
  upperId: string
  urlIds?: readonly string[]
  now?: number
}): Promise<{ afterId: string; hasMore: boolean; admittedIds: string[] }> {
  await Promise.all([
    hackerNewsQueueConfig.waitForInitialization(),
    hackerNewsWorkConfig.waitForInitialization(),
  ])
  if (!areHackerNewsLookupsEnabled()) return { afterId, hasMore: false, admittedIds: [] }
  const size = getHackerNewsWorkLimit('lookup_batch_size')
  const query = sql`/* readmitHackerNewsLookupPage */
    SELECT url_id FROM url_hacker_news_totals
    WHERE url_id > ${afterId}::uuid AND url_id <= ${upperId}::uuid`
  if (urlIds) query.append(sql` AND url_id = ANY(${urlIds}::uuid[])`)
  query.append(sql` ORDER BY url_id LIMIT ${size}`)
  const { rows } = await read<{ url_id: string }>(query)
  const targets = await getHackerNewsLookupTargets(rows.map(row => row.url_id))
  const admittedIds = targets.flatMap(target =>
    target.looked_up_at &&
    getHackerNewsRefreshDelay(target, now) !== null &&
    isHackerNewsLookupDue(target, now)
      ? [target.id]
      : [],
  )
  await enqueueHackerNewsLookups(admittedIds)
  return { afterId: rows.at(-1)?.url_id ?? afterId, hasMore: rows.length === size, admittedIds }
}
