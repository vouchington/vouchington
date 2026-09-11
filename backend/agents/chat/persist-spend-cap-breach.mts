import { OpenAiSpendCapBreachError } from '@services/ai-usage'
import { releaseChatConversationMessageAgenticRunClaim } from '@services/conversations-messages'

/**
 * A mid-loop OpenAI spend-cap breach must reach processAIAgentWorkerJob's job.moveToDelayed()
 * defer (backend/workers/ai-agents/workers/core.mts), not the terminal finalize/error-event path
 * streamChatResponse uses for every other error. Releases the run claim so a deferred retry can
 * re-claim the same conversation message, then reports whether the caller should re-throw instead
 * of finalizing.
 */
export async function releaseChatAgenticRunOnSpendCapBreach(
  error: unknown,
  options: { agenticRunId: string; conversationMessageId: string },
): Promise<boolean> {
  if (!(error instanceof OpenAiSpendCapBreachError)) return false
  await releaseChatConversationMessageAgenticRunClaim({
    conversationMessageId: options.conversationMessageId,
    agenticRunId: options.agenticRunId,
  })
  return true
}
