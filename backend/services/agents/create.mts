import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { AgentType } from './types.mts'

export async function createSystemAgent(
  systemUserId: string,
  agentType: AgentType,
  createdById: string,
  options?: QueryOptions,
): Promise<{ id: string }> {
  const { rows } = await write(
    sql`/* createSystemAgent */
    INSERT INTO agents (system_user_id, agent_type, created_by_id)
    VALUES (${systemUserId}, ${agentType}, ${createdById})
    RETURNING id
    `,
    options,
  )
  return rows[0]
}
