import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getModerator(moderatorId: string): Promise<unknown> {
  const { rows } = await read(sql`
    SELECT
      a.id,
      am.slug,
      a.system_user_id,
      a.activated_at,
      a.deactivated_at
    FROM agents a
    INNER JOIN agents__moderators am ON am.agent_id = a.id
    WHERE a.id = ${moderatorId}
      AND a.deleted_at IS NULL
      AND a.agent_type = 'moderator'
  `)
  return rows[0] || null
}

export async function softDeleteModerator(moderatorId: string): Promise<void> {
  await write(sql`
    UPDATE agents
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${moderatorId}
      AND agent_type = 'moderator'
  `)
}
