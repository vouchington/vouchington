import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentResponseRecord, CreateAgentResponseInput } from './types.mts'

export async function createAgentResponse(
  input: CreateAgentResponseInput,
): Promise<AgentResponseRecord> {
  const { rows } = await write<AgentResponseRecord>(sql`/* createAgentResponse */
    INSERT INTO agent_responses (created_by_id, agent, input, model_name, model_provider)
    VALUES (
      ${input.createdById}::uuid,
      ${input.agent},
      ${JSON.stringify(input.input)}::jsonb,
      ${input.modelName ?? null},
      ${input.modelProvider ?? null}
    )
    RETURNING *
  `)
  return rows[0]
}

export async function countRunningAgentResponsesByUserId(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countRunningAgentResponsesByUserId */
    SELECT COUNT(*)::text AS count
    FROM agent_responses
    WHERE created_by_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
  `)
  return parseInt(rows[0].count, 10)
}
