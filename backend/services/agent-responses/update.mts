import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentResponseRecord, AgentResponseTerminationReason } from './types.mts'

export async function updateAgentResponseStarted(
  id: string,
  jobId: string,
): Promise<AgentResponseRecord | undefined> {
  const { rows } = await write<AgentResponseRecord>(sql`/* updateAgentResponseStarted */
    UPDATE agent_responses
    SET job_id = ${jobId}, started_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid
      AND started_at IS NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND deleted_at IS NULL
    RETURNING *
  `)
  return rows[0]
}

/**
 * Releases an in-flight claim without finalizing it, so a mid-loop OpenAI spend-cap breach
 * (backend/services/ai-usage/spend-cap-guard.mts) can be deferred via job.moveToDelayed() instead
 * of permanently failing the response. Resets exactly the fields updateAgentResponseStarted set,
 * so a later attempt on the same row can re-claim it the same way the first one did.
 */
export async function releaseAgentResponseClaim(id: string): Promise<boolean> {
  const { rows } = await write<{ id: string }>(sql`/* releaseAgentResponseClaim */
    UPDATE agent_responses
    SET job_id = NULL, started_at = NULL, updated_at = NOW()
    WHERE id = ${id}::uuid
      AND started_at IS NOT NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND deleted_at IS NULL
    RETURNING id
  `)
  return Boolean(rows[0])
}

export async function updateAgentResponseCompleted(
  id: string,
  output: { content: string },
  terminationReason: AgentResponseTerminationReason,
): Promise<AgentResponseRecord | undefined> {
  const { rows } = await write<AgentResponseRecord>(sql`/* updateAgentResponseCompleted */
    UPDATE agent_responses
    SET output = ${JSON.stringify(output)}::jsonb,
        termination_reason = ${terminationReason},
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${id}::uuid
      AND completed_at IS NULL
      AND failed_at IS NULL
    RETURNING *
  `)
  return rows[0]
}

export async function updateAgentResponseFailed(
  id: string,
  error: { message: string },
  terminationReason: AgentResponseTerminationReason,
): Promise<AgentResponseRecord | undefined> {
  const { rows } = await write<AgentResponseRecord>(sql`/* updateAgentResponseFailed */
    UPDATE agent_responses
    SET error = ${JSON.stringify(error)}::jsonb,
        termination_reason = ${terminationReason},
        failed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${id}::uuid
      AND completed_at IS NULL
      AND failed_at IS NULL
    RETURNING *
  `)
  return rows[0]
}

export async function updateAgentResponseJobId(id: string, jobId: string): Promise<void> {
  await write(sql`/* updateAgentResponseJobId */
    UPDATE agent_responses
    SET job_id = ${jobId}, updated_at = NOW()
    WHERE id = ${id}::uuid
  `)
}

export async function cancelAgentResponse(id: string): Promise<string | null> {
  const { rows } = await write<{ job_id: string | null }>(sql`/* cancelAgentResponse */
    UPDATE agent_responses
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid AND deleted_at IS NULL
    RETURNING job_id
  `)
  return rows[0]?.job_id ?? null
}
