import type { HostedChatModelProvider } from '@services/agents/model-providers'
import { finalizeChatAgenticRun } from '@services/conversations-messages'
import onError from '@modules/on-error'
import type { ChatStreamEvent } from './stream-types.mts'
import { persistAbortedChatResponse } from './persist-aborted-response.mts'
import { releaseChatAgenticRunOnSpendCapBreach } from './persist-spend-cap-breach.mts'
import { CHAT_SSE_CYCLE_EXPIRED } from './stream-lifecycle.mts'

/**
 * streamChatResponse's single catch handler. A spend-cap breach must propagate uncaught so
 * processAIAgentWorkerJob (backend/workers/ai-agents/workers/core.mts) can job.moveToDelayed()
 * it; every other error finalizes the run and yields a terminal SSE event instead.
 */
export async function handleChatStreamError(
  error: unknown,
  options: {
    agenticRunId: string
    conversationId: string
    conversationMessageId: string
    fullResponse: string
    modelProvider: HostedChatModelProvider
    signal?: AbortSignal
  },
): Promise<ChatStreamEvent | undefined> {
  const releasedForSpendCap = await releaseChatAgenticRunOnSpendCapBreach(error, {
    agenticRunId: options.agenticRunId,
    conversationMessageId: options.conversationMessageId,
  })
  if (releasedForSpendCap) throw error

  const err = error instanceof Error ? error : new Error(String(error))

  if (
    error === CHAT_SSE_CYCLE_EXPIRED ||
    err.name === 'AbortError' ||
    err.name === 'APIUserAbortError'
  ) {
    const abortError = await persistAbortedChatResponse({
      agenticRunId: options.agenticRunId,
      conversationId: options.conversationId,
      conversationMessageId: options.conversationMessageId,
      fullResponse: options.fullResponse,
      modelProvider: options.modelProvider,
      signal: options.signal,
    })
    return abortError ? { type: 'error', error: abortError } : undefined
  }

  onError(err)
  const errorMessage = err.message
  const finalized = await finalizeChatAgenticRun({
    id: options.agenticRunId,
    conversationId: options.conversationId,
    conversationMessageId: options.conversationMessageId,
    content: options.fullResponse || null,
    terminationReason: 'error',
    error: errorMessage,
    ...(options.modelProvider === 'openai' ? {} : { conversationLastResponseId: null }),
  })
  return finalized ? { type: 'error', error: errorMessage } : undefined
}
