import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Agent, AgentType, AgentModerator } from './types.mts'

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/agents/README.md`.
 */
export async function getAgentBySystemUserId(system_user_id: string): Promise<Agent | null> {
  const { rows } = await read<Agent>(sql`/* getAgentBySystemUserId */
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
  const { rows } = await read<Agent>(sql`/* getActiveAgentsByType */
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

/** @public May be removed after intended-use review; production use is unconfirmed. */
export async function getAgentModeratorConfig(agent_id: string): Promise<AgentModerator | null> {
  const { rows } = await read<AgentModerator>(sql`/* getAgentModeratorConfig */
    SELECT
      agent_id,
      created_at,
      updated_at
    FROM moderator_agents
    WHERE agent_id = ${agent_id}
    LIMIT 1
  `)

  if (rows.length === 0) return null

  return rows[0]
}
