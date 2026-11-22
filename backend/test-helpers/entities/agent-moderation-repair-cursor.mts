import { write } from '@data-stores/psql'

export async function getTestAgentModerationRepairCursor() {
  const { rows } = await write<{ id: string; post_id: string; upper_id: string }>(
    `/* getTestAgentModerationRepairCursor */
     SELECT cursor_record_id AS id, cursor_lower_bound_record_id AS post_id,
            sweep_upper_bound_record_id AS upper_id
     FROM post_moderation_retention_cursors WHERE kind = 'agent_moderation_repair'`,
  )
  return rows[0] ?? null
}

export async function clearTestAgentModerationRepairCursor(upperId: string): Promise<void> {
  await write(
    `/* clearTestAgentModerationRepairCursor */
     DELETE FROM post_moderation_retention_cursors
     WHERE kind = 'agent_moderation_repair' AND sweep_upper_bound_record_id = $1::uuid`,
    [upperId],
  )
}
