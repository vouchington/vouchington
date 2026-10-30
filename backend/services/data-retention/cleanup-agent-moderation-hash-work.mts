import type { QueryExecutor } from '@data-stores/psql'

export async function reconsiderChangedPost(
  query: QueryExecutor,
  batchSize: number,
): Promise<{ processed: boolean; hasMore: boolean }> {
  const { rows: work } = await query<{ post_id: string }>(
    `/* listChangedAgentModerationRetentionPost */
     SELECT post_id FROM agent_moderation_retention_post_work_items
     ORDER BY changed_at, post_id LIMIT 1`,
  )
  const postId = work[0]?.post_id
  if (!postId) return { processed: false, hasMore: false }
  return reconsiderChangedPostById(query, postId, batchSize)
}

/** Process one owned post's transactional hash-work page. */
export async function reconsiderChangedPostById(
  query: QueryExecutor,
  postId: string,
  batchSize: number,
): Promise<{ processed: boolean; hasMore: boolean }> {
  await query(
    `/* lockChangedAgentModerationRetentionPost */
    SELECT id FROM posts WHERE id = $1::uuid FOR SHARE`,
    [postId],
  )
  const { rows: lockedWork } = await query<{ cursor_moderation_record_id: string }>(
    `/* lockChangedAgentModerationRetentionCursor */
     SELECT cursor_moderation_record_id FROM agent_moderation_retention_post_work_items
     WHERE post_id = $1::uuid FOR UPDATE`,
    [postId],
  )
  if (!lockedWork[0]) return { processed: false, hasMore: true }
  const { rows } = await query<{ id: string }>(
    `/* listChangedAgentModerationRetentionCandidates */
     SELECT id FROM agent_moderations
     WHERE post_id = $1::uuid AND id > $2::uuid
       AND retention_blocked_reason = 'hash'
     ORDER BY id LIMIT $3`,
    [postId, lockedWork[0].cursor_moderation_record_id, batchSize + 1],
  )
  const page = rows.slice(0, batchSize)
  if (page.length > 0) {
    await query(
      `/* reconcileChangedAgentModerationRetentionCandidates */
       UPDATE agent_moderations moderation
       SET retention_due_at = uuid_extract_timestamp(moderation.id) + INTERVAL '90 days',
           retention_blocked_reason = NULL
       FROM posts post
       WHERE moderation.post_id = $1::uuid AND post.id = moderation.post_id
         AND moderation.id = ANY($2::uuid[])
         AND moderation.retention_blocked_reason = 'hash'
         AND moderation.input_sha256 IS DISTINCT FROM post.llm_moderation_content_sha256`,
      [postId, page.map(row => row.id)],
    )
  }
  if (rows.length > batchSize) {
    await query(
      `/* advanceAgentModerationRetentionPostCursor */
       UPDATE agent_moderation_retention_post_work_items
       SET cursor_moderation_record_id = $2::uuid
       WHERE post_id = $1::uuid`,
      [postId, page.at(-1)!.id],
    )
    return { processed: true, hasMore: true }
  }
  await query(
    `/* finishAgentModerationRetentionPostCursor */
     DELETE FROM agent_moderation_retention_post_work_items WHERE post_id = $1::uuid`,
    [postId],
  )
  const { rows: remaining } = await query<{ post_id: string }>(
    `/* hasChangedAgentModerationRetentionPosts */
     SELECT post_id FROM agent_moderation_retention_post_work_items LIMIT 1`,
  )
  return { processed: true, hasMore: remaining.length > 0 }
}
