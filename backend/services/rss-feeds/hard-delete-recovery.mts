import { enqueueNextHardDeleteRssFeedPages } from './hard-delete-next-page.mts'
import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { enqueueRecoverRssFeedHardDeletes } from '@queues/rss-feed-maintenance/enqueues/hard-delete'

/** Re-admits bounded domain deletion pages after an enqueue crash or worker failure. */
export async function processRecoverRssFeedHardDeletes(data: { afterId: string | null }): Promise<{
  admitted: number
}> {
  const ids = await listPendingRssFeedHardDeletes(data.afterId)
  await enqueueNextHardDeleteRssFeedPages(ids)
  if (ids.length === getPostPublicationWorkLimit('rss_feed_hard_delete_capture_batch_size'))
    await enqueueRecoverRssFeedHardDeletes(ids.at(-1)!)
  return { admitted: ids.length }
}

/** The partial pending-ID index seeks directly to a resumed recovery page in either plan mode. */
export async function listPendingRssFeedHardDeletes(afterId: string | null): Promise<string[]> {
  const limit = getPostPublicationWorkLimit('rss_feed_hard_delete_capture_batch_size')
  const { rows } = await write<{ id: string }>(
    `/* listPendingRssFeedHardDeletes */
    SELECT id FROM rss_feeds
    WHERE hard_delete_requested_at IS NOT NULL
      AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY id LIMIT $2`,
    [afterId, limit],
  )
  return rows.map(row => row.id)
}
