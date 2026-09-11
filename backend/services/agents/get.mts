import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Agent, AgentType, AgentModerator } from './types.mts'

export async function getAgentBySystemUserId(system_user_id: string): Promise<Agent | null> {
  const { rows } = await read(sql`/* getAgentBySystemUserId */
    SELECT
      id,
      system_user_id,
      agent_type,
      activated_at,
      deactivated_at,
      created_at,
      updated_at,
      deleted_at
    FROM agents
    WHERE system_user_id = ${system_user_id}
      AND deleted_at IS NULL
    LIMIT 1
  `)

  if (rows.length === 0) return null

  return rows[0]
}

export async function getActiveAgentsByType(agent_type: AgentType): Promise<Agent[]> {
  const { rows } = await read(sql`/* getActiveAgentsByType */
    SELECT
      id,
      system_user_id,
      agent_type,
      activated_at,
      deactivated_at,
      created_at,
      updated_at,
      deleted_at
    FROM agents
    WHERE agent_type = ${agent_type}
      AND activated_at IS NOT NULL
      AND deactivated_at IS NULL
      AND deleted_at IS NULL
    ORDER BY activated_at DESC
  `)

  return rows
}

export async function getAgentModeratorConfig(agent_id: string): Promise<AgentModerator | null> {
  const { rows } = await read(sql`/* getAgentModeratorConfig */
    SELECT
      agent_id,
      created_at,
      updated_at
    FROM agents__moderators
    WHERE agent_id = ${agent_id}
    LIMIT 1
  `)

  if (rows.length === 0) return null

  return rows[0]
}
