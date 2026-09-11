import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SupportAgentRun } from './types.mts'

export async function getSupportAgentRunByIdempotencyKey(
  idempotencyKey: string,
): Promise<SupportAgentRun | null> {
  const { rows } = await write(sql`/* getSupportAgentRunByIdempotencyKey */
    SELECT id, support_thread_id, support_message_id, claim_token, model_name, model_provider,
           input, output, error,
           CASE WHEN completed_at IS NOT NULL THEN 'completed'
                WHEN failed_at IS NOT NULL THEN 'failed' ELSE 'running' END AS status,
           termination_reason, started_at, completed_at, failed_at, created_at, updated_at
    FROM support_agent_runs
    WHERE idempotency_key = ${idempotencyKey}
    LIMIT 1
  `)
  return (rows[0] as SupportAgentRun | undefined) ?? null
}
