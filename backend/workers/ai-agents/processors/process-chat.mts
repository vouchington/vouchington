import type { Job } from 'glide-mq'
import type { ChatJobData } from '@queues/ai-agents/types'
import { getConversationByIdForMutation } from '@services/conversations-messages/conversations'
import { getPrivateUserByAny } from '@services/users'
import { streamChatResponse } from '@agents/chat'
import { publishChatToken, type TokenChunk } from '@data-stores/valkey-pubsub'
import { createMarkdownStreamBuffer } from '@jongleberry/vurst-markdown/streaming-buffer'
import { updateConversationMessageContent } from '@services/conversations-messages/update-message'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'

export type ProcessChatDeps = {
  getConversationById: typeof getConversationByIdForMutation
  getPrivateUserByAny: typeof getPrivateUserByAny
  publishChatToken: typeof publishChatToken
  streamChatResponse: typeof streamChatResponse
  createMarkdownStreamBuffer: typeof createMarkdownStreamBuffer
  updateConversationMessageContent: typeof updateConversationMessageContent
}

const defaultDeps: ProcessChatDeps = {
  getConversationById: getConversationByIdForMutation,
  getPrivateUserByAny,
  publishChatToken,
  streamChatResponse,
  createMarkdownStreamBuffer,
  updateConversationMessageContent,
}

async function failQueuedAssistantMessage(
  deps: ProcessChatDeps,
  conversationId: string,
  conversationMessageId: string,
  error: string,
): Promise<void> {
  await deps.updateConversationMessageContent(conversationId, conversationMessageId, {
    role: 'assistant',
    content: null,
    error,
  })
}

export async function processChat(
  job: Job<ChatJobData>,
  deps: ProcessChatDeps = defaultDeps,
): Promise<void> {
  const { conversationId, conversationMessageId, userMessage, userId, modelProvider } = job.data

  const conversation = await deps.getConversationById(conversationId)
  if (!conversation) {
    await failQueuedAssistantMessage(
      deps,
      conversationId,
      conversationMessageId,
      'Unable to load conversation for chat response.',
    )
    return
  }

  const currentUser = await deps.getPrivateUserByAny(userId)
  if (!currentUser) {
    await failQueuedAssistantMessage(
      deps,
      conversationId,
      conversationMessageId,
      'Unable to load user for chat response.',
    )
    return
  }

  const abortController = new AbortController()
  const signalInterval = setInterval(() => {
    if (job.signals?.some(s => s.name === CHAT_SSE_CYCLE_EXPIRED)) {
      abortController.abort(CHAT_SSE_CYCLE_EXPIRED)
    } else if (job.signals?.some(s => s.name === 'abort')) {
      abortController.abort()
    }
  }, 500).unref()

  const markdownBuffer = deps.createMarkdownStreamBuffer()

  try {
    for await (const event of deps.streamChatResponse({
      conversation,
      conversationMessageId,
      userMessage,
      currentUser,
      modelProvider,
      signal: abortController.signal,
    })) {
      if (event.type === 'text') {
        for (const piece of markdownBuffer.push(event.content)) {
          // oxlint-disable-next-line no-await-in-loop -- each publish must settle before the next chunk to preserve token order
          await deps.publishChatToken(conversationMessageId, { type: 'text', content: piece })
        }
      } else {
        const tail = markdownBuffer.flush()
        if (tail) {
          await deps.publishChatToken(conversationMessageId, { type: 'text', content: tail })
        }
        const chunk: TokenChunk & Record<string, string | undefined> = { type: event.type }
        if (event.type === 'tool_call') {
          chunk['tool_call_id'] = event.tool_call_id
          chunk['name'] = event.name
          chunk['arguments'] = event.arguments
        }
        if (event.type === 'tool_result') {
          chunk['tool_call_id'] = event.tool_call_id
          chunk['result'] = event.result
        }
        if (event.type === 'subagent_step') {
          chunk['agent_name'] = event.agent_name
          chunk['tool_name'] = event.tool_name
          if (event.tool_call_id) chunk['tool_call_id'] = event.tool_call_id
        }
        if (event.type === 'subagent_text') {
          chunk['agent_name'] = event.agent_name
          chunk['content'] = event.content
          if (event.tool_call_id) chunk['tool_call_id'] = event.tool_call_id
        }
        if (event.type === 'error') chunk['error'] = event.error
        await deps.publishChatToken(conversationMessageId, chunk)
      }
      if (event.type === 'done' || event.type === 'error') {
        clearInterval(signalInterval)
        break
      }
    }
  } finally {
    clearInterval(signalInterval)
  }
}
