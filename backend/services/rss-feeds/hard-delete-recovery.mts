import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import {
  enqueueHardDeleteRssFeedSourcePage,
  enqueueRecoverRssFeedHardDeletes,
} from '@queues/rss-feed-maintenance/enqueues/hard-delete'

/** Re-admits bounded domain deletion pages after an enqueue crash or worker failure. */
export async function processRecoverRssFeedHardDeletes(data: { afterId: string | null }): Promise<{
  admitted: number
}> {
  const limit = getPostPublicationWorkLimit('rss_feed_hard_delete_capture_batch_size')
  const { rows } = await write<{ id: string }>(
    `/* processRecoverRssFeedHardDeletes */
    SELECT id FROM rss_feeds
    WHERE hard_delete_requested_at IS NOT NULL
      AND ($1::uuid IS NULL OR id > $1::uuid)
    ORDER BY id LIMIT $2`,
    [data.afterId, limit],
  )
  await Promise.all(rows.map(row => enqueueHardDeleteRssFeedSourcePage(row.id)))
  if (rows.length === limit) await enqueueRecoverRssFeedHardDeletes(rows.at(-1)!.id)
  return { admitted: rows.length }
}
