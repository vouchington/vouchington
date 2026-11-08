import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

/** Walk one bounded, supplied topic set in the active-feed unique index order. */
export async function listTopicPublicationFeedsPage(
  topicIds: readonly string[],
  afterTopicId: string | null,
) {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ id: string; topic_id: string }>(
    `/* listTopicPublicationFeedsPage */
    SELECT id, topic_id FROM rss_feeds
    WHERE topic_id = ANY($1::uuid[]) AND deleted_at IS NULL
      AND topic_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY topic_id LIMIT $3`,
    [topicIds, afterTopicId, limit + 1],
  )
  const page = rows.slice(0, limit)
  const hasMore = rows.length > limit
  return { ids: page.map(row => row.id), hasMore, cursor: hasMore ? page.at(-1)!.topic_id : null }
}
