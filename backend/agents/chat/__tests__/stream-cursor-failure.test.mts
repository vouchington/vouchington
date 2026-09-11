import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { getConversationMessageAgenticRunsByConversationMessageId } from '@services/conversations-messages/agentic-runs'
import { getConversationById } from '@services/conversations-messages/conversations'
import { streamChatResponse } from '../stream.mts'

describe('streamChatResponse cursor persistence', () => {
  it('persists the provider cursor before emitting done', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Cursor failure')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const events = []

    for await (const event of streamChatResponse({
      conversation,
      conversationMessageId: message.id,
      userMessage: 'hello',
      currentUser: user,
      deps: {
        checkMessageSafety: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
        buildChatInput: vi
          .fn<VitestLooseMock>()
          .mockResolvedValue([{ role: 'user', content: 'hello' }]),
        runToolLoopStreaming: vi.fn<VitestLooseMock>().mockImplementation(async function* () {
          yield { type: 'text', content: 'durable answer' }
          return {
            text: 'durable answer',
            iterations: 1,
            terminationReason: 'no_tool_calls',
            lastResponseId: 'response-1',
          }
        }),
      },
    })) {
      events.push(event)
    }

    expect(events.at(-1)).toEqual({ type: 'done' })
    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages[0]?.content).toEqual({ role: 'assistant', content: 'durable answer' })
    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs[0]).toMatchObject({ status: 'completed' })
    await expect(getConversationById(conversation.id)).resolves.toMatchObject({
      last_response_id: 'response-1',
    })
  })
})
