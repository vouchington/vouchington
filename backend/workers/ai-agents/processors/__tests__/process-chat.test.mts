import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { ChatJobData } from '@queues/ai-agents/types'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'
import { processChat, type ProcessChatDeps } from '../process-chat.mts'

describe('processChat cycle expiry', () => {
  it.each([
    {
      signalName: CHAT_SSE_CYCLE_EXPIRED,
      assertReason: (reason: unknown) => expect(reason).toBe(CHAT_SSE_CYCLE_EXPIRED),
    },
    {
      signalName: 'abort',
      assertReason: (reason: unknown) => expect(reason).toBeInstanceOf(DOMException),
    },
  ])('passes $signalName to the chat stream abort signal', async ({ signalName, assertReason }) => {
    vi.useFakeTimers()
    try {
      const job = {
        id: 'chat_assistant-1',
        name: 'chat',
        data: {
          conversationId: 'conversation-1',
          conversationMessageId: 'assistant-1',
          userMessageId: 'user-message-1',
          userMessage: 'Hello',
          userId: 'user-1',
        },
        signals: [{ name: signalName, data: null, receivedAt: Date.now() }],
      } as unknown as Job<ChatJobData>
      let observedReason: unknown
      const streamChatResponse: ProcessChatDeps['streamChatResponse'] = async function* (params) {
        await new Promise<void>(resolve => {
          params.signal?.addEventListener(
            'abort',
            () => {
              observedReason = params.signal?.reason
              resolve()
            },
            { once: true },
          )
        })
        yield { type: 'done' }
      }
      const deps = {
        getConversationById: vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'conversation-1' }),
        getPrivateUserByAny: vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'user-1' }),
        publishChatToken: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
        streamChatResponse,
        createMarkdownStreamBuffer: () => ({ push: () => [], flush: () => '' }),
        updateConversationMessageContent: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      } as unknown as ProcessChatDeps

      const processPromise = processChat(job, deps)
      await vi.advanceTimersByTimeAsync(500)
      await processPromise

      assertReason(observedReason)
    } finally {
      vi.useRealTimers()
    }
  })
})
