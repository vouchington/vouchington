import type { QueryExecutor } from '@data-stores/psql'

export type AgentModerationRepairPosition = { id: string; post_id: string }

export async function repairAgentModerationRetentionPage(
  query: QueryExecutor,
  batchSize: number,
  after: AgentModerationRepairPosition,
  lowerBoundId: string,
  upperBoundId: string,
  postIds?: readonly string[],
) {
  // Post dates cannot bound moderation age. Find the latest post at or after the
  // cursor's post ID to prune future partitions. If it vanished and no later post
  // exists, the cursor's post ID is already an upper bound for every remaining row.
  const { rows } = await query<AgentModerationRepairPosition>(
    `/* listAgentModerationRetentionRepairPage */
     SELECT id, post_id FROM agent_moderations
     WHERE id >= $1::uuid AND id < $2::uuid AND (id, post_id) > ($3::uuid, $4::uuid)
       AND post_id <= COALESCE((
         SELECT id FROM posts WHERE id >= $4::uuid ORDER BY id DESC LIMIT 1
       ), $4::uuid)
       AND retention_due_at IS NULL AND retention_blocked_reason IS NULL${postIds ? '\n       AND post_id = ANY($6::uuid[])' : ''}
     ORDER BY id, post_id LIMIT $5`,
    [lowerBoundId, upperBoundId, after.id, after.post_id, batchSize, ...(postIds ? [postIds] : [])],
  )
  const next = rows.length === batchSize ? rows.at(-1)! : null
  if (rows.length === 0) return { scanned: 0, next }

  // Check only this inspected page. A new successor can make an unchanged keeper
  // eligible later, so rows without one stay in the ordinary NULL-due state.
  const { rowCount } = await query(
    `/* repairAgentModerationRetentionDueDates */
     UPDATE agent_moderations moderation
     SET retention_due_at = uuid_extract_timestamp(moderation.id) + INTERVAL '90 days'
     FROM (
       SELECT id, post_id FROM unnest($1::uuid[], $2::uuid[]) AS input(id, post_id)
       ORDER BY id, post_id
     ) AS page
     WHERE moderation.post_id = page.post_id AND moderation.id = page.id
       AND moderation.retention_due_at IS NULL AND moderation.retention_blocked_reason IS NULL
       AND (
         SELECT newer.id FROM agent_moderations newer
         WHERE newer.post_id = moderation.post_id AND newer.prompt_id = moderation.prompt_id
           AND newer.id > moderation.id
         LIMIT 1
       ) IS NOT NULL
       AND (
         moderation.deleted_at IS NOT NULL OR (
           SELECT newer.id FROM agent_moderations newer
           WHERE newer.post_id = moderation.post_id AND newer.prompt_id = moderation.prompt_id
             AND newer.id > moderation.id AND newer.deleted_at IS NULL
           LIMIT 1
         ) IS NOT NULL
       )`,
    [rows.map(row => row.id), rows.map(row => row.post_id)],
  )
  // Let the ordinary due pass delete under its source lock. This update changes
  // a non-key column and does not conflict with an FK reference's key-share lock.
  return { scanned: rowCount ?? 0, next }
}
