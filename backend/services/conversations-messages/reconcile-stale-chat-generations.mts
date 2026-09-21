import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const CHAT_RUNTIME_GENERATION_STALE_AFTER_MS = 10 * 60 * 1000
export const CHAT_RUNTIME_GENERATION_BATCH_SIZE = 100
export const CHAT_RUNTIME_GENERATION_INTERRUPTED_ERROR =
  'The response was interrupted. Please try again.'
export type StaleChatRuntimeGenerationCandidate = {
  id: string
  signalJobId: string
  startedAt: Date
}

export type StaleChatRuntimeGenerationBatch = {
  cutoff: Date
  candidates: StaleChatRuntimeGenerationCandidate[]
}

type CandidateRow = {
  id: string
  signal_job_id: string
  started_at: Date
}

/**
 * Hosted chat remains available until A6 removes its conversation-run persistence. A crashed
 * worker must therefore terminalize its run so the conversation can accept another turn.
 */
export async function getStaleChatRuntimeGenerationJobs(
  options: {
    staleAfterMs?: number
    batchSize?: number
  } = {},
): Promise<StaleChatRuntimeGenerationBatch> {
  const staleAfterMs = options.staleAfterMs ?? CHAT_RUNTIME_GENERATION_STALE_AFTER_MS
  const batchSize = Math.min(
    Math.max(Math.trunc(options.batchSize ?? CHAT_RUNTIME_GENERATION_BATCH_SIZE), 1),
    CHAT_RUNTIME_GENERATION_BATCH_SIZE,
  )
  const cutoff = new Date(Date.now() - staleAfterMs)
  const { rows } = await write<CandidateRow>(sql`/* getStaleChatRuntimeGenerationJobs */
    SELECT id, 'chat_' || conversation_message_id::text AS signal_job_id, started_at
    FROM conversation_message_agentic_runs
    WHERE started_at < ${cutoff}
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND deleted_at IS NULL
      AND parent_agentic_run_id IS NULL
    ORDER BY started_at ASC, id ASC
    LIMIT ${batchSize}
  `)
  return {
    cutoff,
    candidates: rows.map(row => ({
      id: row.id,
      signalJobId: row.signal_job_id,
      startedAt: row.started_at,
    })),
  }
}

export async function reconcileStaleChatRuntimeGenerations(
  batch: StaleChatRuntimeGenerationBatch,
): Promise<{ chats: number }> {
  await using query = await beginTransaction()

  let chats = 0
  for (const candidate of batch.candidates) {
    // oxlint-disable-next-line no-await-in-loop -- one transaction serializes the bounded CAS batch
    const result = await query(sql`/* reconcileSelectedStaleChatGeneration */
      WITH stale AS (
        UPDATE conversation_message_agentic_runs
        SET error = ${JSON.stringify({ error: CHAT_RUNTIME_GENERATION_INTERRUPTED_ERROR })}::jsonb,
            termination_reason = 'error',
            failed_at = NOW()
        WHERE id = ${candidate.id}
          AND started_at < ${batch.cutoff}
          AND completed_at IS NULL
          AND failed_at IS NULL
          AND deleted_at IS NULL
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
        SET content = cm.content || ${JSON.stringify({ error: CHAT_RUNTIME_GENERATION_INTERRUPTED_ERROR })}::jsonb
        FROM stale
        WHERE cm.conversation_id = stale.conversation_id
          AND cm.id = stale.conversation_message_id
          AND cm.deleted_at IS NULL
      )
      SELECT conversation_message_id FROM stale
    `)
    chats += result.rows.length
  }

  await query.commit()
  return { chats }
}
