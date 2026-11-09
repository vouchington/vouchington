import { getMinUUIDv7ForDate } from '@modules/utils'
import '@services/elections-votes/entity-relation/register-election-vote-handler'
import type { TransactionQuery } from '@data-stores/psql'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { assertEntityRelationUpsertAllowed } from '@services/entity-relations/upsert'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { handleElectionVotes } from '@services/entity-relations/upsert-helpers'
import { recordStoryTopicPublicationChanges } from '@services/post-publication/capture-story-topics'
import type { PrivateUser } from '@services/users/types'
import type { StoryCategoryWork } from './story-post-category-projection-types.mts'

/** Process one bounded item/category page while holding the actual work row. */
export async function projectStoryCategorySourcePage(
  query: TransactionQuery,
  work: StoryCategoryWork,
  postId: string,
  actor: PrivateUser,
  limit: number,
): Promise<{ processed: number; relations: Awaited<ReturnType<typeof writeEntityRelations>> }> {
  let itemId = work.active_item_id
  if (!itemId && work.sweep_upper_bound_item_id) {
    const { rows } = await query<{ id: string }>(
      `/* nextStoryCategorySourceItem */ SELECT id FROM rss_feed_items
       WHERE story_id = $1 AND deleted_at IS NULL AND id <= $2
         AND id ${work.cursor_item_id ? '>' : '>='} $3::uuid
       ORDER BY story_id, deleted_at, id LIMIT 1`,
      [
        work.story_id,
        work.sweep_upper_bound_item_id,
        work.cursor_item_id ?? getMinUUIDv7ForDate(new Date(0)),
      ],
    )
    itemId = rows[0]?.id ?? null
  }
  if (!itemId) {
    await query(
      '/* finishStoryCategorySource */ UPDATE story_post_category_projection_jobs SET source_completed_at = clock_timestamp(), active_item_id = NULL, cursor_category_identity_id = NULL WHERE story_id = $1 AND generation = $2',
      [work.story_id, work.generation],
    )
    return { processed: 0, relations: [] }
  }
  const { rows } = await query<{ category_identity_id: string; topic_id: string | null }>(
    `/* listStoryCategorySourcePage */ SELECT category_identity_id, topic_id FROM rss_feed_item_categories
     WHERE rss_feed_item_id = $1 AND category_identity_id ${work.active_item_id && work.cursor_category_identity_id ? '>' : '>='} $2::uuid
     ORDER BY category_identity_id LIMIT $3`,
    [
      itemId,
      (work.active_item_id && work.cursor_category_identity_id) || getMinUUIDv7ForDate(new Date(0)),
      limit + 1,
    ],
  )
  const page = rows.slice(0, limit)
  const topicIds = [
    ...new Set(page.flatMap(row => (row.topic_id ? [row.topic_id] : []))),
  ].toSorted()
  let relations: Awaited<ReturnType<typeof writeEntityRelations>> = []
  if (topicIds.length) {
    await query(
      `/* recordStoryCategoryProjectionReceipts */ INSERT INTO story_post_category_projection_receipts (story_id, topic_id, generation)
      SELECT $1, topic_id, $2 FROM unnest($3::uuid[]) AS input(topic_id) ORDER BY topic_id
      ON CONFLICT (story_id, topic_id) DO UPDATE SET generation = EXCLUDED.generation`,
      [work.story_id, work.generation, topicIds],
    )
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'category',
      objectType: 'topic',
    })
    const objects = topicIds.map(id => ({ id }))
    await assertEntityRelationUpsertAllowed(actor, relation, { id: postId }, objects, { query })
    relations = await writeEntityRelations(
      relation,
      actor,
      objects.map(object => ({ subject: { id: postId }, object })),
      { query, capturePublication: false, vote: false },
    )
    // A replay must not replace an existing user's prior ballot on an already-active relation.
    relations = relations.filter(row => row.newly_active === true)
    if (relations.length) {
      await handleElectionVotes(actor, relation, relations, { query })
      await recordStoryTopicPublicationChanges(query, [
        {
          storyId: work.story_id,
          impactedTopicIds: relations.map(row => row.object_id),
          impactedPostIds: [postId],
        },
      ])
    }
  }
  if (rows.length > limit) {
    await query(
      '/* advanceStoryCategorySourcePage */ UPDATE story_post_category_projection_jobs SET active_item_id = $3, cursor_category_identity_id = $4 WHERE story_id = $1 AND generation = $2',
      [work.story_id, work.generation, itemId, page.at(-1)!.category_identity_id],
    )
  } else {
    await query(
      '/* advanceStoryCategorySourceItem */ UPDATE story_post_category_projection_jobs SET cursor_item_id = $3, active_item_id = NULL, cursor_category_identity_id = NULL WHERE story_id = $1 AND generation = $2',
      [work.story_id, work.generation, itemId],
    )
  }
  return { processed: page.length, relations }
}
