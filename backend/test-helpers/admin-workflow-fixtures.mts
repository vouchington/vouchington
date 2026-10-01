import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
export async function readAdminWorkflowTraining(actorId: string) {
  const { rows } = await read(sql`/* readAdminWorkflowTraining */
    SELECT id FROM moderation_training_feedbacks WHERE actor_user_id = ${actorId} ORDER BY id
  `)
  return rows
}

export async function readAdminWorkflowLifecycle(kind: 'appeal' | 'dispute', id: string) {
  const table =
    kind === 'appeal' ? 'moderation_appeal_lifecycle_changes' : 'review_dispute_lifecycle_changes'
  const key = kind === 'appeal' ? 'moderation_appeal_id' : 'review_dispute_id'
  const query = sql`/* readAdminWorkflowLifecycle */ SELECT change_type, changed_by_id, metadata FROM `
  query
    .append(table)
    .append(' WHERE ')
    .append(key)
    .append(sql` = ${id} ORDER BY id`)
  const { rows } = await read<{
    change_type: string
    changed_by_id: string | null
    metadata: Record<string, unknown>
  }>(query)
  return rows
}

export async function readAdminWorkflowVoteWeight(userId: string) {
  const { rows } = await read<{
    vote_weight: number
    vote_weight_admin_set_at: Date | null
  }>(sql`/* readAdminWorkflowVoteWeight */
    SELECT vote_weight, vote_weight_admin_set_at FROM users WHERE id = ${userId}
  `)
  return rows[0]!
}

export async function readAdminWorkflowWarnings(userId: string) {
  const { rows } = await read<{
    id: string
    issued_by_id: string
  }>(sql`/* readAdminWorkflowWarnings */
    SELECT id, issued_by_id FROM user_warnings WHERE user_id = ${userId} ORDER BY id
  `)
  return rows
}
