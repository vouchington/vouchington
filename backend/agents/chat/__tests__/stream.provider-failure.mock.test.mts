import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

import { streamChatResponse } from '../stream.mts'
import { createTestUser } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import {
  getConversationById,
  updateConversationLastResponseId,
} from '@services/conversations-messages/conversations'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { getConversationMessageAgenticRunsByConversationMessageId } from '@services/conversations-messages/agentic-runs'
import { streamOpenAIResponse } from '@modules/openai-utils/create-response'

describe('streamChatResponse provider failure persistence', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.mocked(streamOpenAIResponse).mockReset()
  })

  it('persists partial text as an error and preserves the prior response id', async () => {
    const currentUser = await createTestUser()
    const createdConversation = await createConversation(currentUser.id, 'OpenAI Failure Test')
    await updateConversationLastResponseId(createdConversation.id, 'resp-prior')
    const conversation = (await getConversationById(createdConversation.id))!
    const message = await createConversationMessage(conversation.id, currentUser.id, {
      role: 'assistant',
      content: null,
    })
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* () {
      yield { delta: 'partial answer' }
      throw new Error('OpenAI response failed (server_error): provider failed')
    })

    const events = []
    for await (const event of streamChatResponse({
      conversation,
      conversationMessageId: message.id,
      userMessage: 'Please answer',
      currentUser,
      deps: {
        checkMessageSafety: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
        buildChatInput: vi
          .fn<VitestLooseMock>()
          .mockResolvedValue([{ role: 'user', content: 'sanitized input' }]),
      },
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'text', content: 'partial answer' },
      { type: 'error', error: 'OpenAI response failed (server_error): provider failed' },
    ])
    expect((await getConversationById(conversation.id))?.last_response_id).toBe('resp-prior')
    expect((await getConversationMessagesByConversationId(conversation.id))[0]?.content).toEqual({
      role: 'assistant',
      content: 'partial answer',
      error: 'OpenAI response failed (server_error): provider failed',
    })
    expect(
      (await getConversationMessageAgenticRunsByConversationMessageId(message.id))[0],
    ).toMatchObject({
      status: 'failed',
      error: { error: 'OpenAI response failed (server_error): provider failed' },
    })
  })
})
