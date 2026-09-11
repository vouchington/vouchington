import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function updateConversationMessageAgenticRunEventOutput(
  conversationMessageAgenticRunId: string,
  id: string,
  output: unknown,
): Promise<void> {
  await write(sql`/* updateConversationMessageAgenticRunEventOutput */
    UPDATE conversation_message_agentic_runs_events
    SET output = ${JSON.stringify(output)}
    WHERE conversation_message_agentic_run_id = ${conversationMessageAgenticRunId}
      AND id = ${id}
  `)
}
