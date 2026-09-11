import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ConversationMessageAgenticRunTerminationReason } from './types.mts'
export { updateConversationMessageAgenticRunEventOutput } from './update-event-output.mts'

export async function updateConversationMessageAgenticRunOutput(
  id: string,
  output: unknown,
  terminationReason: Exclude<ConversationMessageAgenticRunTerminationReason, 'error'>,
): Promise<void> {
  await write(sql`/* updateConversationMessageAgenticRunOutput */
    UPDATE conversation_message_agentic_runs
    SET output = ${JSON.stringify(output)},
        termination_reason = ${terminationReason},
        completed_at = CURRENT_TIMESTAMP,
        failed_at = NULL
    WHERE id = ${id}
  `)
}

export async function updateConversationMessageAgenticRunError(
  id: string,
  error: unknown,
  terminationReason: ConversationMessageAgenticRunTerminationReason = 'error',
): Promise<void> {
  await write(sql`/* updateConversationMessageAgenticRunError */
    UPDATE conversation_message_agentic_runs
    SET error = ${JSON.stringify(error)},
        termination_reason = ${terminationReason},
        completed_at = NULL,
        failed_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `)
}

export async function finalizeChatAgenticRun(options: {
  id: string
  conversationId: string
  conversationMessageId: string
  content: string | null
  terminationReason: ConversationMessageAgenticRunTerminationReason
  error?: string
  conversationLastResponseId?: string | null
}): Promise<boolean> {
  await using query = await beginTransaction()

  const terminalAt = options.error ? 'failed_at' : 'completed_at'
  const statement = sql`/* finalizeChatAgenticRun */
      UPDATE conversation_message_agentic_runs
      SET termination_reason = ${options.terminationReason},
          output = ${options.error ? null : JSON.stringify({ response: options.content ?? '' })},
          error = ${options.error ? JSON.stringify({ error: options.error }) : null},
    `
  statement.append(terminalAt === 'failed_at' ? sql`failed_at = NOW()` : sql`completed_at = NOW()`)
  statement.append(sql`
      WHERE id = ${options.id}
        AND completed_at IS NULL
        AND failed_at IS NULL
      RETURNING id
    `)
  const { rows } = await query<{ id: string }>(statement)
  if (!rows[0]) {
    await query.commit()
    return false
  }
  const messageResult = await query(sql`/* finalizeChatAgenticRunMessage */
      UPDATE conversation_messages
      SET content = ${JSON.stringify({
        role: 'assistant',
        content: options.content,
        ...(options.error ? { error: options.error } : {}),
      })}
      WHERE conversation_id = ${options.conversationId}
        AND id = ${options.conversationMessageId}
        AND deleted_at IS NULL
    `)
  if (messageResult.rowCount !== 1) {
    throw new Error('Chat assistant message was unavailable during finalization')
  }
  if ('conversationLastResponseId' in options) {
    const conversationResult = await query(sql`/* finalizeChatAgenticRunConversationCursor */
        UPDATE conversations
        SET last_response_id = ${options.conversationLastResponseId ?? null}
        WHERE id = ${options.conversationId}
          AND deleted_at IS NULL
      `)
    if (conversationResult.rowCount !== 1) {
      throw new Error('Chat conversation was unavailable during finalization')
    }
  }
  await query.commit()
  return true
}

/**
 * Releases an in-flight chat claim without finalizing it, so a mid-loop OpenAI spend-cap breach
 * (backend/services/ai-usage/spend-cap-guard.mts) can be deferred via job.moveToDelayed() instead
 * of permanently failing the request. Soft-deletes the run row rather than finalizing it:
 * claimChatConversationMessageAgenticRun (backend/services/conversations-messages/create.mts) never
 * mutates conversation_messages.content itself, so the message's pending placeholder is untouched
 * and a retried job can re-claim it. Same advisory-lock key as the claim, so this cannot race a
 * concurrent claim/finalize on the same message.
 */
export async function releaseChatConversationMessageAgenticRunClaim(options: {
  conversationMessageId: string
  agenticRunId: string
}): Promise<boolean> {
  await using query = await beginTransaction()
  await query(sql`/* lockReleaseChatConversationMessageAgenticRunClaim */
    SELECT pg_advisory_xact_lock(hashtextextended(${options.conversationMessageId}, 0))
  `)
  const { rows } = await query<{
    id: string
  }>(sql`/* releaseChatConversationMessageAgenticRunClaim */
    UPDATE conversation_message_agentic_runs
    SET deleted_at = NOW()
    WHERE id = ${options.agenticRunId}
      AND conversation_message_id = ${options.conversationMessageId}
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND deleted_at IS NULL
    RETURNING id
  `)
  const result = Boolean(rows[0])

  await query.commit()
  return result
}

export async function failChatEnqueue(options: {
  conversationId: string
  conversationMessageId: string
  error: string
}): Promise<boolean> {
  await using query = await beginTransaction()

  await query(sql`/* lockFailedChatEnqueue */
      SELECT pg_advisory_xact_lock(hashtextextended(${options.conversationMessageId}, 0))
    `)
  const transitionedRun = await query<{ id: string }>(sql`/* failClaimedChatEnqueueRun */
      UPDATE conversation_message_agentic_runs
      SET termination_reason = 'error',
          output = NULL,
          error = ${JSON.stringify({ error: options.error })},
          completed_at = NULL,
          failed_at = NOW()
      WHERE conversation_id = ${options.conversationId}
        AND conversation_message_id = ${options.conversationMessageId}
        AND parent_agentic_run_id IS NULL
        AND completed_at IS NULL
        AND failed_at IS NULL
        AND deleted_at IS NULL
      RETURNING id
    `)
  const existingRun = await query<{ exists: boolean }>(sql`/* hasChatEnqueueRun */
      SELECT EXISTS (
        SELECT 1
        FROM conversation_message_agentic_runs
        WHERE conversation_id = ${options.conversationId}
          AND conversation_message_id = ${options.conversationMessageId}
          AND parent_agentic_run_id IS NULL
          AND deleted_at IS NULL
      ) AS exists
    `)
  if (!transitionedRun.rows[0] && existingRun.rows[0]?.exists) {
    await query.commit()
    return false
  }
  const messageResult = await query(sql`/* failChatEnqueueMessage */
      UPDATE conversation_messages
      SET content = ${JSON.stringify({
        role: 'assistant',
        content: null,
        error: options.error,
      })}
      WHERE conversation_id = ${options.conversationId}
        AND id = ${options.conversationMessageId}
        AND deleted_at IS NULL
        AND content->>'role' = 'assistant'
        AND content->>'content' IS NULL
        AND content->>'error' IS NULL
    `)
  if (messageResult.rowCount !== 1 && transitionedRun.rows[0]) {
    throw new Error('Chat assistant message was unavailable during enqueue failure')
  }
  await query.commit()
  return messageResult.rowCount === 1
}
