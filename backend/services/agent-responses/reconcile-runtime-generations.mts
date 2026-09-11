import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const RUNTIME_GENERATION_STALE_AFTER_MS = 10 * 60 * 1000
export const RUNTIME_GENERATION_BATCH_SIZE = 100
export const RUNTIME_GENERATION_INTERRUPTED_ERROR =
  'The response was interrupted. Please try again.'
export const RUNTIME_GENERATION_INTERRUPTED_SIGNAL = 'runtime-generation-interrupted'

export type StaleRuntimeGenerationCandidate = {
  kind: 'agent-response' | 'chat'
  id: string
  signalJobId: string
  startedAt: Date
}

export type StaleRuntimeGenerationBatch = {
  cutoff: Date
  candidates: StaleRuntimeGenerationCandidate[]
}

type CandidateRow = {
  kind: StaleRuntimeGenerationCandidate['kind']
  id: string
  signal_job_id: string
  started_at: Date
}

export async function getStaleRuntimeGenerationJobs(
  options: {
    staleAfterMs?: number
    batchSize?: number
  } = {},
): Promise<StaleRuntimeGenerationBatch> {
  const staleAfterMs = options.staleAfterMs ?? RUNTIME_GENERATION_STALE_AFTER_MS
  const batchSize = Math.min(
    Math.max(Math.trunc(options.batchSize ?? RUNTIME_GENERATION_BATCH_SIZE), 1),
    RUNTIME_GENERATION_BATCH_SIZE,
  )
  const cutoff = new Date(Date.now() - staleAfterMs)
  const { rows } = await write<CandidateRow>(sql`/* getStaleRuntimeGenerationJobsPrimary */
    SELECT kind, id, signal_job_id, started_at
    FROM (
      SELECT 'agent-response' AS kind, id, job_id AS signal_job_id, started_at
      FROM agent_responses
      WHERE started_at < ${cutoff}
        AND completed_at IS NULL AND failed_at IS NULL AND deleted_at IS NULL
        AND job_id IS NOT NULL
      UNION ALL
      SELECT 'chat' AS kind, id, 'chat_' || conversation_message_id::text AS signal_job_id,
        started_at
      FROM conversation_message_agentic_runs
      WHERE started_at < ${cutoff}
        AND completed_at IS NULL AND failed_at IS NULL AND deleted_at IS NULL
        AND parent_agentic_run_id IS NULL
    ) candidates
    ORDER BY started_at ASC, id ASC
    LIMIT ${batchSize}
  `)
  return {
    cutoff,
    candidates: rows.map(row => ({
      kind: row.kind,
      id: row.id,
      signalJobId: row.signal_job_id,
      startedAt: row.started_at,
    })),
  }
}

export async function reconcileStaleRuntimeGenerations(
  batch: StaleRuntimeGenerationBatch,
): Promise<{ agentResponses: number; chats: number; agentResponseIds: string[] }> {
  await using query = await beginTransaction()

  const agentResponseIds: string[] = []
  let chats = 0
  for (const candidate of batch.candidates) {
    if (candidate.kind === 'agent-response') {
      // oxlint-disable-next-line no-await-in-loop -- one transaction serializes the bounded CAS batch
      const result = await query<{ id: string }>(sql`/* reconcileSelectedStaleAgentResponse */
          UPDATE agent_responses
          SET error = ${JSON.stringify({ message: RUNTIME_GENERATION_INTERRUPTED_ERROR })}::jsonb,
              termination_reason = 'stalled', failed_at = NOW(), updated_at = NOW()
          WHERE id = ${candidate.id}::uuid
            AND started_at < ${batch.cutoff}
            AND completed_at IS NULL AND failed_at IS NULL AND deleted_at IS NULL
          RETURNING id
        `)
      if (result.rows[0]) agentResponseIds.push(result.rows[0].id)
      continue
    }

    // oxlint-disable-next-line no-await-in-loop -- one transaction serializes the bounded CAS batch
    const result = await query(sql`/* reconcileSelectedStaleChatGeneration */
        WITH stale AS (
          UPDATE conversation_message_agentic_runs
          SET error = ${JSON.stringify({ error: RUNTIME_GENERATION_INTERRUPTED_ERROR })}::jsonb,
              termination_reason = 'error', failed_at = NOW()
          WHERE id = ${candidate.id}
            AND started_at < ${batch.cutoff}
            AND completed_at IS NULL AND failed_at IS NULL AND deleted_at IS NULL
            AND parent_agentic_run_id IS NULL
          RETURNING conversation_id, conversation_message_id, model_provider
        ), clear_non_openai_cursor AS (
          UPDATE conversations c
          SET last_response_id = NULL
          FROM stale
          WHERE c.id = stale.conversation_id
            AND stale.model_provider <> 'openai'
            AND c.deleted_at IS NULL
        ), update_assistant_message AS (
          UPDATE conversation_messages cm
          SET content = cm.content || ${JSON.stringify({ error: RUNTIME_GENERATION_INTERRUPTED_ERROR })}::jsonb
          FROM stale
          WHERE cm.conversation_id = stale.conversation_id
            AND cm.id = stale.conversation_message_id
            AND cm.deleted_at IS NULL
        )
        SELECT conversation_message_id FROM stale
      `)
    chats += result.rows.length
  }
  const result = { agentResponses: agentResponseIds.length, chats, agentResponseIds }

  await query.commit()
  return result
}
