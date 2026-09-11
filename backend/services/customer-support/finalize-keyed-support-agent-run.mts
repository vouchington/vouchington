import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createIdempotentSupportDraftMessage } from './create-idempotent-support-draft-message.mts'
import { markInboundCustomerSupportCompleted } from './mark-inbound-customer-support-completed.mts'
import type { SupportAgentRunTerminationReason } from './types.mts'

export async function finalizeKeyedSupportAgentRun(params: {
  threadId: string
  supportMessageId: string
  agentRunId: string
  claimToken: string
  responseText: string | null
  iterations: number
  terminationReason: Exclude<SupportAgentRunTerminationReason, 'error'>
}): Promise<boolean> {
  await using query = await beginTransaction()
  const finalized = await finalizeKeyedSupportAgentRunInTransaction(params, query)
  await query.commit()
  return finalized
}

async function finalizeKeyedSupportAgentRunInTransaction(
  params: {
    threadId: string
    supportMessageId: string
    agentRunId: string
    claimToken: string
    responseText: string | null
    iterations: number
    terminationReason: Exclude<SupportAgentRunTerminationReason, 'error'>
  },
  query: TransactionQuery,
): Promise<boolean> {
  await query(sql`/* finalizeKeyedSupportAgentRunLockReceipt */
    SELECT ses_message_id
    FROM support_inbound_email_receipts
    WHERE support_thread_id = ${params.threadId}
      AND support_message_id = ${params.supportMessageId}
    ORDER BY ses_message_id
    FOR UPDATE
  `)
  const { rows: threadRows } = await write<{
    resolved_at: Date | null
    latest_inbound_message_id: string | null
  }>(
    sql`/* finalizeKeyedSupportAgentRunLockThread */
      SELECT
        resolved_at,
        (
          SELECT id
          FROM support_messages
          WHERE support_thread_id = ${params.threadId}
            AND direction = 'inbound'
          ORDER BY support_thread_id DESC, id DESC
          LIMIT 1
        ) AS latest_inbound_message_id
      FROM support_threads
      WHERE id = ${params.threadId}
      FOR UPDATE
    `,
    { query },
  )
  const { rows } = await query<{
    completed_at: Date | null
    failed_at: Date | null
    support_message_id: string
    staff_draft_requested_at: Date | null
  }>(sql`/* finalizeKeyedSupportAgentRunLock */
    SELECT completed_at, failed_at, support_message_id, staff_draft_requested_at
    FROM support_agent_runs
    WHERE id = ${params.agentRunId}
      AND support_thread_id = ${params.threadId}
      AND claim_token = ${params.claimToken}
      AND idempotency_key IS NOT NULL
    FOR UPDATE
  `)
  const run = rows[0]
  if (!run || run.support_message_id !== params.supportMessageId || run.failed_at) return false

  if (run.completed_at) {
    await markInboundCustomerSupportCompleted(
      params.threadId,
      run.support_message_id,
      run.completed_at,
      query,
    )
    return false
  }

  if (threadRows[0]?.latest_inbound_message_id !== params.supportMessageId) {
    await query(sql`/* finalizeKeyedSupportAgentRunSupersedeOlderInbound */
      UPDATE support_agent_runs
      SET error = ${JSON.stringify({ error: 'Superseded by a newer inbound support message' })},
          termination_reason = 'superseded',
          completed_at = CURRENT_TIMESTAMP,
          failed_at = NULL
      WHERE id = ${params.agentRunId}
        AND claim_token = ${params.claimToken}
        AND completed_at IS NULL
    `)
    await markInboundCustomerSupportCompleted(
      params.threadId,
      run.support_message_id,
      new Date(),
      query,
    )
    return false
  }

  if (threadRows[0]?.resolved_at && run.staff_draft_requested_at) {
    await query(sql`/* finalizeKeyedSupportAgentRunFailResolvedStaffDraft */
      UPDATE support_agent_runs
      SET error = ${JSON.stringify({ error: 'Thread resolved before draft finalization' })},
          termination_reason = 'error', completed_at = NULL, failed_at = CURRENT_TIMESTAMP
      WHERE id = ${params.agentRunId}
        AND claim_token = ${params.claimToken}
        AND completed_at IS NULL
    `)
    return false
  }

  if (threadRows[0]?.resolved_at) {
    await query(sql`/* finalizeKeyedSupportAgentRunCompleteResolvedAutomatic */
      UPDATE support_agent_runs SET error = ${JSON.stringify({ error: 'Thread resolved before automatic draft finalization' })},
          termination_reason = 'superseded', completed_at = CURRENT_TIMESTAMP, failed_at = NULL
      WHERE id = ${params.agentRunId} AND claim_token = ${params.claimToken} AND completed_at IS NULL
    `)
    await markInboundCustomerSupportCompleted(
      params.threadId,
      run.support_message_id,
      new Date(),
      query,
    )
    return false
  }

  const draft = params.responseText
    ? await createIdempotentSupportDraftMessage(
        params.threadId,
        {
          bodyText: params.responseText,
          agentRunId: params.agentRunId,
        },
        { query },
      )
    : null
  const { rows: persistedDraftRows } = draft
    ? { rows: [{ body_text: draft.body_text }] }
    : await query<{ body_text: string }>(sql`/* finalizeKeyedSupportAgentRunExistingDraft */
        SELECT body_text
        FROM support_messages
        WHERE support_thread_id = ${params.threadId}
          AND agent_run_id = ${params.agentRunId}
        LIMIT 1
      `)
  const response = persistedDraftRows[0]?.body_text ?? null
  const { rows: completionRows } = await query<{
    completed_at: Date
  }>(sql`/* finalizeKeyedSupportAgentRun */
    UPDATE support_agent_runs
    SET output = ${JSON.stringify({ response, iterations: params.iterations })},
        error = NULL,
        termination_reason = ${params.terminationReason},
        completed_at = CURRENT_TIMESTAMP,
        failed_at = NULL
    WHERE id = ${params.agentRunId}
      AND support_thread_id = ${params.threadId}
      AND claim_token = ${params.claimToken}
      AND idempotency_key IS NOT NULL
    RETURNING completed_at
  `)
  const completion = completionRows[0]
  if (!completion) throw new Error('Keyed support agent run was unavailable during finalization')

  await markInboundCustomerSupportCompleted(
    params.threadId,
    run.support_message_id,
    completion.completed_at,
    query,
  )
  return true
}
