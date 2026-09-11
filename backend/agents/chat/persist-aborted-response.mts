import type { HostedChatModelProvider } from '@services/agents/model-providers'
import { finalizeChatAgenticRun } from '@services/conversations-messages'
import { CHAT_RESPONSE_INTERRUPTED_ERROR, CHAT_SSE_CYCLE_EXPIRED } from './stream-lifecycle.mts'

export async function persistAbortedChatResponse(options: {
  agenticRunId: string
  conversationId: string
  conversationMessageId: string
  fullResponse: string
  modelProvider: HostedChatModelProvider
  signal?: AbortSignal
}): Promise<string | undefined> {
  const content = options.fullResponse || null
  if (options.signal?.reason === CHAT_SSE_CYCLE_EXPIRED) {
    const finalized = await finalizeChatAgenticRun({
      id: options.agenticRunId,
      conversationId: options.conversationId,
      conversationMessageId: options.conversationMessageId,
      content,
      terminationReason: 'error',
      error: CHAT_RESPONSE_INTERRUPTED_ERROR,
      ...(options.modelProvider === 'openai' ? {} : { conversationLastResponseId: null }),
    })
    return finalized ? CHAT_RESPONSE_INTERRUPTED_ERROR : undefined
  }

  await finalizeChatAgenticRun({
    id: options.agenticRunId,
    conversationId: options.conversationId,
    conversationMessageId: options.conversationMessageId,
    content,
    terminationReason: 'stalled',
    ...(options.modelProvider === 'openai' ? {} : { conversationLastResponseId: null }),
  })
  return undefined
}
