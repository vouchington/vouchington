import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type PostgreSQLTimestamp = Date | string

export async function setAgentResponseStartedAt(
  agentResponseId: string,
  startedAt: PostgreSQLTimestamp,
): Promise<void> {
  await write(sql`/* setAgentResponseStartedAt */
    UPDATE agent_responses SET started_at = ${startedAt}
    WHERE id = ${agentResponseId}::uuid
  `)
}

export async function setChatAgenticRunStartedAt(
  agenticRunId: string,
  startedAt: PostgreSQLTimestamp,
): Promise<void> {
  await write(sql`/* setChatAgenticRunStartedAt */
    UPDATE conversation_message_agentic_runs SET started_at = ${startedAt}
    WHERE id = ${agenticRunId}
  `)
}

export async function softDeleteTestConversationMessage(
  conversationMessageId: string,
  deletedById: string,
): Promise<void> {
  await write(sql`/* softDeleteTestConversationMessage */
    UPDATE conversation_messages
    SET deleted_at = NOW(), deleted_by_id = ${deletedById}
    WHERE id = ${conversationMessageId}
      AND deleted_at IS NULL
  `)
}
