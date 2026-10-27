import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

/** Invalidation includes redirected and deleted identities; they confer no live authority. */
export async function listLiveTopicMergedSourcesPage(topicId: string, afterId: string | null) {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ id: string; slug: string }>(
    `/* listLiveTopicMergedSourcesPage */
    -- no-mistakes-disable-next-line postgres-required-predicates: invalidate merged-source cache keys, including identities that no longer authorize a live topic.
    SELECT id, slug FROM topics
    WHERE merged_into_topic_id = $1::uuid
      AND id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY id LIMIT $3`,
    [topicId, afterId, limit],
  )
  return {
    ids: rows.map(row => row.id),
    slugs: rows.map(row => row.slug),
    cursor: rows.length === limit ? rows.at(-1)!.id : null,
  }
}
