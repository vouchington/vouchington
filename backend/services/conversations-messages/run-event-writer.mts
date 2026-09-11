import { createConversationMessageAgenticRunEvent } from './create.mts'
import { updateConversationMessageAgenticRunEventOutput } from './update.mts'
import type { ConversationMessageAgenticRunEventType } from './types.mts'
import onError from '@modules/on-error'

export type RunEventWriter = (
  type: ConversationMessageAgenticRunEventType,
  input: unknown,
  output: unknown,
) => Promise<void>

export function createRunEventWriter(agenticRunId: string): RunEventWriter {
  return async (
    type: ConversationMessageAgenticRunEventType,
    input: unknown,
    output: unknown,
  ): Promise<void> => {
    // eventId is null only when create fails; the null check below is the early-return guard.
    const eventId = await createConversationMessageAgenticRunEvent({
      conversationMessageAgenticRunId: agenticRunId,
      type,
      input,
    })
      .then(event => event.id)
      .catch(error => {
        // Run events are observability records — a transient DB error must not abort the agent run
        onError(error instanceof Error ? error : new Error(String(error)))
        return null
      })

    if (eventId === null) return

    try {
      await updateConversationMessageAgenticRunEventOutput(agenticRunId, eventId, output)
    } catch (error) {
      // Output write failed after event row was created — log as a separate category
      // so orphaned event rows (missing output) can be distinguished from create failures
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }
}
