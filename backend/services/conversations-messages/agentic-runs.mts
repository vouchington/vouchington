import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ConversationMessageAgenticRun, ConversationMessageAgenticRunEvent } from './types.mts'

function appendAgenticRunStatus(query: SQLStatement): void {
  query.append(sql`
      CASE
        WHEN failed_at IS NOT NULL THEN 'failed'
        WHEN completed_at IS NOT NULL THEN 'completed'
        ELSE 'running'
      END AS status
  `)
}

export async function getConversationMessageAgenticRunById(
  id: string,
): Promise<ConversationMessageAgenticRun | null> {
  const query = sql`/* getConversationMessageAgenticRunById */
    SELECT
      id,
      conversation_id,
      conversation_message_id,
      parent_agentic_run_id,
      model_name,
      model_provider,
      input,
      output,
      error,
  `
  appendAgenticRunStatus(query)
  query.append(sql`,
      termination_reason,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at,
      deleted_at
    FROM conversation_message_agentic_runs
    WHERE id = ${id}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  const { rows } = await read(query)
  return rows[0] || null
}

export async function getConversationMessageAgenticRunEventsByRunId(
  conversationMessageAgenticRunId: string,
): Promise<ConversationMessageAgenticRunEvent[]> {
  const { rows } = await read(sql`/* getConversationMessageAgenticRunEventsByRunId */
    SELECT
      id,
      conversation_message_agentic_run_id,
      type,
      input,
      output,
      created_at,
      updated_at,
      deleted_at
    FROM conversation_message_agentic_runs_events
    WHERE conversation_message_agentic_run_id = ${conversationMessageAgenticRunId}
      AND deleted_at IS NULL
    ORDER BY id ASC
  `)
  return rows
}

export async function getConversationMessageAgenticRunsByConversationMessageId(
  conversationMessageId: string,
): Promise<ConversationMessageAgenticRun[]> {
  const query = sql`/* getConversationMessageAgenticRunsByConversationMessageId */
    SELECT
      id,
      conversation_id,
      conversation_message_id,
      parent_agentic_run_id,
      model_name,
      model_provider,
      input,
      output,
      error,
  `
  appendAgenticRunStatus(query)
  query.append(sql`,
      termination_reason,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at,
      deleted_at
    FROM conversation_message_agentic_runs
    WHERE conversation_message_id = ${conversationMessageId}
      AND deleted_at IS NULL
    ORDER BY id ASC
  `)
  const { rows } = await read(query)
  return rows
}

export async function hasRunningAgenticRunByConversationId(
  conversationId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* hasRunningAgenticRunByConversationId */
    SELECT 1
    FROM conversation_message_agentic_runs
    WHERE conversation_id = ${conversationId}
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function hasActiveChatTurnByConversationId(conversationId: string): Promise<boolean> {
  const { rows } = await read(sql`/* hasActiveChatTurnByConversationId */
    SELECT 1
    FROM conversation_message_agentic_runs
    WHERE conversation_id = ${conversationId}
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND deleted_at IS NULL
    UNION ALL
    SELECT 1
    FROM conversation_messages cm
    WHERE cm.conversation_id = ${conversationId}
      AND cm.deleted_at IS NULL
      AND cm.content->>'role' = 'assistant'
      AND cm.content->>'content' IS NULL
      AND cm.content->>'error' IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM conversation_message_agentic_runs cmar
        WHERE cmar.conversation_message_id = cm.id
          AND cmar.deleted_at IS NULL
      )
    LIMIT 1
  `)
  return rows.length > 0
}

export async function getLatestConversationMessageAgenticRunByConversationMessageId(
  conversationMessageId: string,
): Promise<ConversationMessageAgenticRun | null> {
  const query = sql`/* getLatestConversationMessageAgenticRunByConversationMessageId */
    SELECT
      id,
      conversation_id,
      conversation_message_id,
      parent_agentic_run_id,
      model_name,
      model_provider,
      input,
      output,
      error,
  `
  appendAgenticRunStatus(query)
  query.append(sql`,
      termination_reason,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at,
      deleted_at
    FROM conversation_message_agentic_runs
    WHERE conversation_message_id = ${conversationMessageId}
      AND deleted_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `)
  const { rows } = await read(query)
  return rows[0] || null
}
