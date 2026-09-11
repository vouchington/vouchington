import { describe, expect, it, vi } from 'vitest'
import { createOpenAIModerationResponse, createTestUser } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import { requestOpenAIModeration } from '@modules/openai-utils/moderate'
import type { buildChatInput } from './build-input.mts'
import { streamChatResponse } from './stream.mts'

const moderation = vi.hoisted(() => vi.fn<typeof requestOpenAIModeration>())
vi.mock<typeof import('@modules/openai-utils/moderate')>(
  import('@modules/openai-utils/moderate'),
  async importOriginal => ({ ...(await importOriginal()), requestOpenAIModeration: moderation }),
)

describe('chat safety', () => {
  it('moderates a streamed response before completing it', async () => {
    moderation.mockResolvedValueOnce(createOpenAIModerationResponse())
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Chat safety')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const runToolLoopStreaming = vi.fn<VitestLooseMock>().mockImplementation(async function* () {
      yield { type: 'text', content: 'safe response' }
      return { text: 'safe response', iterations: 1, terminationReason: 'no_tool_calls' }
    })
    const events = []
    for await (const event of streamChatResponse({
      conversation,
      conversationMessageId: message.id,
      userMessage: 'hello',
      currentUser: user,
      deps: {
        buildChatInput: vi
          .fn<typeof buildChatInput>()
          .mockResolvedValue([{ role: 'user', content: 'hello' }]),
        runToolLoopStreaming,
      },
    }))
      events.push(event)
    expect(moderation).toHaveBeenCalledOnce()
    expect(events).toContainEqual({ type: 'done' })
  })
})
