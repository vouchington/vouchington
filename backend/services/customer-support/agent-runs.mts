import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'
import type { SupportAgentRun, SupportAgentRunTerminationReason } from './types.mts'
import { appendSupportAgentRunStatus } from './support-agent-run-status.mts'
const KEYED_SUPPORT_AGENT_LEASE_MS = 4 * 60 * 1000
export async function createSupportAgentRun(params: {
  supportThreadId: string
  supportMessageId: string
  modelName: AgentModel
  modelProvider: AgentModelProvider
  input: unknown
}): Promise<SupportAgentRun> {
  const { supportThreadId, supportMessageId, modelName, modelProvider, input } = params
  const query = sql`/* createSupportAgentRun */
    INSERT INTO support_agent_runs (
      support_thread_id, support_message_id,
      model_name, model_provider,
      input
    ) VALUES (
      ${supportThreadId},
      ${supportMessageId},
      ${modelName},
      ${modelProvider},
      ${JSON.stringify(input)}
    )
    RETURNING
      id, support_thread_id, support_message_id,
      claim_token,
      model_name,
      model_provider,
      input,
      output,
      error,
  `
  appendSupportAgentRunStatus(query)
  query.append(sql`,
      termination_reason,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at
  `)
  const { rows } = await write(query)
  return rows[0] as SupportAgentRun
}
export async function claimKeyedSupportAgentRun(params: {
  supportThreadId: string
  supportMessageId: string
  idempotencyKey: string
  reclaimLiveLease?: boolean
  modelName: AgentModel
  modelProvider: AgentModelProvider
  input: unknown
}): Promise<SupportAgentRun | null> {
  const {
    supportThreadId,
    supportMessageId,
    idempotencyKey,
    reclaimLiveLease = false,
    modelName,
    modelProvider,
    input,
  } = params
  const query = sql`/* claimKeyedSupportAgentRun */
    INSERT INTO support_agent_runs AS claimed (
      support_thread_id, support_message_id,
      idempotency_key,
      claim_token,
      model_name, model_provider,
      input
    ) VALUES (
      ${supportThreadId},
      ${supportMessageId},
      ${idempotencyKey},
      uuidv7()::TEXT,
      ${modelName},
      ${modelProvider},
      ${JSON.stringify(input)}
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE
    SET output = NULL,
        error = NULL,
        termination_reason = NULL,
        claim_token = uuidv7()::TEXT,
        started_at = CURRENT_TIMESTAMP,
        completed_at = NULL,
        failed_at = NULL
    WHERE claimed.support_thread_id = EXCLUDED.support_thread_id
      AND (
        claimed.support_message_id = EXCLUDED.support_message_id OR
        claimed.staff_draft_requested_at IS NOT NULL
      )
      AND claimed.completed_at IS NULL
      AND (
        claimed.claim_token IS NULL OR
        claimed.failed_at IS NOT NULL OR
        ${reclaimLiveLease} OR
        claimed.started_at IS NULL OR
        claimed.started_at <=
          CURRENT_TIMESTAMP - ${KEYED_SUPPORT_AGENT_LEASE_MS} * INTERVAL '1 millisecond'
      )
    RETURNING
      id, support_thread_id, support_message_id,
      claim_token,
      model_name,
      model_provider,
      input,
      output,
      error,
  `
  appendSupportAgentRunStatus(query)
  query.append(sql`,
      termination_reason,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at
  `)
  const { rows } = await write(query)
  return (rows[0] as SupportAgentRun | undefined) ?? null
}
export async function getSupportAgentRunById(id: string): Promise<SupportAgentRun | null> {
  const query = sql`/* getSupportAgentRunById */
    SELECT
      id,
      support_thread_id,
      support_message_id,
      claim_token,
      model_name,
      model_provider,
      input,
      output,
      error,
  `
  appendSupportAgentRunStatus(query)
  query.append(sql`,
      termination_reason,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at
    FROM support_agent_runs
    WHERE id = ${id}
    LIMIT 1
  `)
  const { rows } = await read(query)
  return (rows[0] as SupportAgentRun | undefined) ?? null
}

export async function updateSupportAgentRunOutput(
  id: string,
  output: unknown,
  terminationReason: Exclude<SupportAgentRunTerminationReason, 'error'>,
): Promise<void> {
  await write(sql`/* updateSupportAgentRunOutput */
    UPDATE support_agent_runs
    SET output = ${JSON.stringify(output)},
        termination_reason = ${terminationReason},
        completed_at = CURRENT_TIMESTAMP,
        failed_at = NULL
    WHERE id = ${id}
      AND claim_token IS NULL
  `)
}
export async function updateSupportAgentRunError(id: string, error: unknown): Promise<void> {
  await write(sql`/* updateSupportAgentRunError */
    UPDATE support_agent_runs
    SET error = ${JSON.stringify(error)},
        termination_reason = 'error',
        completed_at = NULL,
        failed_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
      AND claim_token IS NULL
  `)
}
export async function updateClaimedSupportAgentRunError(
  id: string,
  claimToken: string,
  error: unknown,
): Promise<boolean> {
  const result = await write(sql`/* updateClaimedSupportAgentRunError */
    UPDATE support_agent_runs
    SET error = ${JSON.stringify(error)},
        termination_reason = 'error',
        completed_at = NULL,
        failed_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
      AND claim_token = ${claimToken}
      AND idempotency_key IS NOT NULL
      AND completed_at IS NULL
  `)
  return result.rowCount === 1
}
