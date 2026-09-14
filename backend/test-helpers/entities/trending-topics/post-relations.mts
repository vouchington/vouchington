import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function insertBatchPostRelations(params: {
  count: number
  topicId: string
  userId: string
  netVote: number
  createdAt?: Date
  tableName: string
}) {
  const { count, topicId, userId, netVote, createdAt, tableName } = params
  const sha256 = `\\x${'0'.repeat(64)}`
  const postTimestampMs = createdAt ? createdAt.getTime() - 1 : undefined
  const postIds = Array.from({ length: count }, () =>
    postTimestampMs !== undefined ? uuidv7({ msecs: postTimestampMs }) : uuidv7(),
  )

  await write(
    sql`/* insertBatchPostRelations:posts */
    INSERT INTO posts (id, post_type, title, markdown, created_by_id, broadcast, privacy, is_anonymous, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT unnest_id, 'discussion', 'Trending test post', 'test', ${userId}, 'everyone', 'public', false, ${sha256}, ${sha256}
    FROM UNNEST(${postIds}::uuid[]) AS unnest_id`,
  )
  await write(
    sql`/* insertBatchPostRelations:approve */
    WITH inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id, metadata)
      SELECT unnest_id, 'approve', ${userId}, '{"source":"trending-topic-test-helper"}'::jsonb
      FROM UNNEST(${postIds}::uuid[]) AS unnest_id
      RETURNING id, post_id, created_at
    )
    UPDATE posts
    SET latest_clearance_change_id = inserted_change.id,
      approved_at = inserted_change.created_at,
      rejected_at = NULL,
      in_review_at = NULL,
      updated_by_id = ${userId}
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id`,
  )
  await write(
    sql`/* insertBatchPostRelations:slugs */
    INSERT INTO post_slugs (post_id, slug)
    SELECT unnest_id, 'trending-test-' || unnest_id::text
    FROM UNNEST(${postIds}::uuid[]) AS unnest_id`,
  )

  const scoreUp = netVote > 0 ? 1 : 0
  const scoreDown = netVote < 0 ? 1 : 0
  const relationTimestampMs = createdAt ? createdAt.getTime() : undefined
  const relationIds = Array.from({ length: count }, () =>
    relationTimestampMs !== undefined ? uuidv7({ msecs: relationTimestampMs }) : uuidv7(),
  )

  await write(
    sql`/* insertBatchPostRelations:relations */
    INSERT INTO `
      .append(tableName)
      .append(
        sql` (id, subject_id, object_id, created_by_id, votes_score_up, votes_score_down)
    SELECT r.relation_id, r.post_id, ${topicId}, ${userId}, ${scoreUp}, ${scoreDown}
    FROM UNNEST(${relationIds}::uuid[], ${postIds}::uuid[]) AS r(relation_id, post_id)`,
      ),
  )
}
