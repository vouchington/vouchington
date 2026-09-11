import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { getConversationMessageAgenticRunsByConversationMessageId } from '@services/conversations-messages/agentic-runs'
import type { PrivateUser } from '@services/users/types'
import { streamChatResponse } from '../stream.mts'
import { CHAT_RESPONSE_INTERRUPTED_ERROR, CHAT_SSE_CYCLE_EXPIRED } from '../stream-lifecycle.mts'

describe('streamChatResponse cycle expiry', () => {
  let testUser: PrivateUser

  beforeAll(async () => {
    testUser = await createTestUser()
  })

  it('persists a retryable error and partial content', async () => {
    const conversation = await createConversation(testUser.id, 'Expired Cycle Chat')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })
    const controller = new AbortController()
    controller.abort(CHAT_SSE_CYCLE_EXPIRED)
    const streamAnthropicChat = vi.fn<VitestLooseMock>().mockImplementation(async function* ({
      signal,
    }: {
      signal?: AbortSignal
    }) {
      yield { type: 'text', content: 'partial ' }
      signal?.throwIfAborted()
    })

    const events = []
    for await (const event of streamChatResponse({
      conversation,
      conversationMessageId: message.id,
      userMessage: 'Use Claude',
      currentUser: testUser,
      modelProvider: 'anthropic',
      signal: controller.signal,
      deps: {
        checkMessageSafety: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
        streamAnthropicChat,
        buildChatInput: vi
          .fn<VitestLooseMock>()
          .mockResolvedValue([{ role: 'user', content: 'history' }]),
      },
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'text', content: 'partial ' },
      { type: 'error', error: CHAT_RESPONSE_INTERRUPTED_ERROR },
    ])
    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs[0]?.status).toBe('failed')
    expect(runs[0]?.error).toEqual({ error: CHAT_RESPONSE_INTERRUPTED_ERROR })
    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages[0]?.content).toEqual({
      role: 'assistant',
      content: 'partial ',
      error: CHAT_RESPONSE_INTERRUPTED_ERROR,
    })
  })
})
