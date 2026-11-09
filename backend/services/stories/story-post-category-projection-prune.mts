import { getMinUUIDv7ForDate } from '@modules/utils'
import type { TransactionQuery } from '@data-stores/psql'
import { recordStoryTopicPublicationChanges } from '@services/post-publication/capture-story-topics'
import type { StoryCategoryWork } from './story-post-category-projection-types.mts'

/** Prune only a bounded raw relation page, then advance even when every relation is retained. */
export async function pruneStoryCategoryRelationPage(
  query: TransactionQuery,
  work: StoryCategoryWork,
  postId: string,
  actorId: string,
  limit: number,
): Promise<number> {
  const { rows } = await query<{ object_id: string }>(
    `/* listStoryCategoryRelationPage */ SELECT object_id FROM relation__post__category__topic
     WHERE subject_id = $1 AND object_id ${work.cursor_relation_topic_id ? '>' : '>='} $2::uuid
     ORDER BY object_id LIMIT $3`,
    [postId, work.cursor_relation_topic_id ?? getMinUUIDv7ForDate(new Date(0)), limit + 1],
  )
  const page = rows.slice(0, limit)
  const ids = page.map(row => row.object_id)
  const removed = await query<{ object_id: string }>(
    `/* pruneStoryCategoryRelationPage */ WITH candidates AS MATERIALIZED (
       SELECT candidate.subject_id, candidate.object_id
       FROM unnest($2::uuid[]) AS wanted(topic_id)
       CROSS JOIN LATERAL (
         SELECT relation.subject_id, relation.object_id
         FROM relation__post__category__topic relation
         LEFT JOIN LATERAL (
           SELECT generation FROM story_post_category_projection_receipts
           WHERE story_id = $3 AND topic_id = relation.object_id LIMIT 1
         ) receipt ON TRUE
         WHERE relation.subject_id = $1 AND relation.object_id = wanted.topic_id
           AND relation.deleted_at IS NULL AND receipt.generation IS DISTINCT FROM $5::bigint
         LIMIT 1 FOR UPDATE OF relation
       ) candidate
     )
     UPDATE relation__post__category__topic relation
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $4
     FROM candidates
     WHERE relation.subject_id = candidates.subject_id AND relation.object_id = candidates.object_id
       AND relation.deleted_at IS NULL
     RETURNING relation.object_id`,
    [postId, ids, work.story_id, actorId, work.generation],
  )
  if (removed.rows.length) {
    await recordStoryTopicPublicationChanges(query, [
      {
        storyId: work.story_id,
        impactedPostIds: [postId],
        impactedTopicIds: removed.rows.map(row => row.object_id),
      },
    ])
  }
  await query(
    `/* advanceStoryCategoryRelationPage */ UPDATE story_post_category_projection_jobs
     SET cursor_relation_topic_id = $3, relations_completed_at = CASE WHEN $4 THEN clock_timestamp() ELSE NULL END
     WHERE story_id = $1 AND generation = $2`,
    [
      work.story_id,
      work.generation,
      page.at(-1)?.object_id ?? work.cursor_relation_topic_id,
      rows.length <= limit,
    ],
  )
  return page.length
}

/** Receipts have no FK to work: completion deletes them in bounded pages before the work row. */
export async function cleanStoryCategoryReceiptPage(
  query: TransactionQuery,
  work: StoryCategoryWork,
  limit: number,
): Promise<boolean> {
  const { rows } = await query<{ topic_id: string }>(
    `/* listStoryCategoryReceiptPage */ SELECT topic_id FROM story_post_category_projection_receipts
     WHERE story_id = $1 AND topic_id ${work.cursor_receipt_topic_id ? '>' : '>='} $2::uuid ORDER BY topic_id LIMIT $3`,
    [work.story_id, work.cursor_receipt_topic_id ?? getMinUUIDv7ForDate(new Date(0)), limit + 1],
  )
  const page = rows.slice(0, limit)
  if (page.length) {
    await query(
      '/* deleteStoryCategoryReceiptPage */ DELETE FROM story_post_category_projection_receipts WHERE story_id = $1 AND topic_id = ANY($2::uuid[])',
      [work.story_id, page.map(row => row.topic_id)],
    )
  }
  if (rows.length > limit) {
    await query(
      '/* advanceStoryCategoryReceiptPage */ UPDATE story_post_category_projection_jobs SET cursor_receipt_topic_id = $3 WHERE story_id = $1 AND generation = $2',
      [work.story_id, work.generation, page.at(-1)!.topic_id],
    )
    return false
  }
  await query(
    '/* completeStoryCategoryProjection */ DELETE FROM story_post_category_projection_jobs WHERE story_id = $1 AND generation = $2',
    [work.story_id, work.generation],
  )
  return true
}
