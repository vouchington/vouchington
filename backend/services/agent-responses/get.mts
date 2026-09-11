import { query, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentResponseRecord } from './types.mts'

export async function getAgentResponseById(
  id: string,
  options: QueryOptions = {},
): Promise<AgentResponseRecord | null> {
  const { rows } = await query<AgentResponseRecord>(
    sql`/* getAgentResponseById */
    SELECT
      id, created_by_id, agent, model_name, model_provider, job_id,
      input, output, error, termination_reason,
      started_at, completed_at, failed_at, deleted_at, created_at, updated_at
    FROM agent_responses WHERE id = ${id}::uuid AND deleted_at IS NULL
  `,
    { readOnly: true, ...options },
  )
  return rows[0] ?? null
}
