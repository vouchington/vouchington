import type { QueryExecutor } from '@data-stores/psql'

type Candidate = { id: string; post_id: string }

export async function deleteAgentModerationRetentionPage(
  query: QueryExecutor,
  page: readonly Candidate[],
  upperBoundId: string,
  upperBoundDueAt: string,
): Promise<number> {
  const { rows: deletedRows } = await query<{ id: string; post_id: string }>(
    `/* deleteObsoleteAgentModerations */
     WITH page AS (
       SELECT * FROM unnest($1::uuid[], $2::uuid[]) AS page(id, post_id)
     )
     DELETE FROM agent_moderations moderation USING page
     WHERE moderation.id = page.id AND moderation.post_id = page.post_id
       AND moderation.id < $3::uuid
       AND moderation.retention_due_at <= $4::timestamptz
       AND EXISTS (
         SELECT 1 FROM agent_moderations newer
         WHERE newer.post_id = moderation.post_id
           AND newer.prompt_id = moderation.prompt_id AND newer.id > moderation.id
         LIMIT 1 FOR SHARE
       )
       AND (
         moderation.deleted_at IS NOT NULL OR EXISTS (
           SELECT 1 FROM agent_moderations newer_live
           WHERE newer_live.post_id = moderation.post_id
             AND newer_live.prompt_id = moderation.prompt_id
             AND newer_live.id > moderation.id AND newer_live.deleted_at IS NULL
           LIMIT 1 FOR SHARE
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM posts current_post
         WHERE current_post.id = moderation.post_id
           AND current_post.llm_moderation_content_sha256 = moderation.input_sha256
       )
       AND NOT EXISTS (
         SELECT 1 FROM moderation_training_feedbacks feedback
         WHERE feedback.agent_moderation_id = moderation.id
           AND feedback.post_id = moderation.post_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM vote_integrity_flags flag
         WHERE flag.agent_moderation_id = moderation.id
           AND flag.agent_moderation_post_id = moderation.post_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM agent_moderation_votes vote
         WHERE vote.agent_moderation_id = moderation.id
           AND vote.post_id = moderation.post_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM moderator_actions action
         WHERE action.agent_moderation_id = moderation.id
           AND action.agent_moderation_post_id = moderation.post_id
       )
     RETURNING moderation.id, moderation.post_id`,
    [page.map(row => row.id), page.map(row => row.post_id), upperBoundId, upperBoundDueAt],
  )
  // Every surviving page member has a durable blocker. A matching lifecycle event wakes it;
  // an unchanged daily run never selects it again. Source deletes release eligible transparency
  // cohorts before decrementing, and privately drain sealed cohorts below the disclosure floor.
  await query(
    `/* blockAgentModerationRetentionCandidates */
     UPDATE agent_moderations moderation
     SET retention_due_at = NULL,
         retention_blocked_reason = CASE
           WHEN EXISTS (
             SELECT 1 FROM moderation_training_feedbacks feedback
             WHERE feedback.post_id = moderation.post_id AND feedback.agent_moderation_id = moderation.id
           ) OR EXISTS (
             SELECT 1 FROM vote_integrity_flags flag
             WHERE flag.agent_moderation_post_id = moderation.post_id AND flag.agent_moderation_id = moderation.id
           ) OR EXISTS (
             SELECT 1 FROM agent_moderation_votes vote
             WHERE vote.post_id = moderation.post_id AND vote.agent_moderation_id = moderation.id
           ) OR EXISTS (
             SELECT 1 FROM moderator_actions action
             WHERE action.agent_moderation_post_id = moderation.post_id AND action.agent_moderation_id = moderation.id
           ) THEN 'reference'
           WHEN EXISTS (
             SELECT 1 FROM posts post
             WHERE post.id = moderation.post_id
               AND post.llm_moderation_content_sha256 = moderation.input_sha256
           ) THEN 'hash'
           ELSE 'newest'
         END::agent_moderation_retention_block_reasons
     FROM unnest($1::uuid[], $2::uuid[]) AS page(id, post_id)
     WHERE moderation.id = page.id AND moderation.post_id = page.post_id
       AND moderation.retention_due_at IS NOT NULL`,
    [page.map(row => row.id), page.map(row => row.post_id)],
  )
  return deletedRows.length
}
