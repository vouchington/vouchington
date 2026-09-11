import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { OpenAiSpendCapBreachError, type OpenAiSpendCapBreach } from '@services/ai-usage'
import {
  claimChatConversationMessageAgenticRun,
  createConversation,
  createConversationMessage,
  createConversationMessageAgenticRun,
} from '../create.mts'
import {
  releaseChatConversationMessageAgenticRunClaim,
  updateConversationMessageAgenticRunOutput,
} from '../update.mts'
import { streamChatResponse } from '../../../agents/chat/index.mts'
import { getConversationMessagesByConversationId } from '../messages.mts'

describe('streamChatResponse mid-loop OpenAI spend-cap breach', () => {
  it('releases the run claim and rethrows instead of finalizing the turn as an error', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Spend cap mid-loop breach')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }

    const collect = async () => {
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
            yield* []
            throw new OpenAiSpendCapBreachError(breach)
          }),
        },
      })) {
        events.push(event)
      }
      return events
    }

    await expect(collect()).rejects.toThrow(OpenAiSpendCapBreachError)

    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages[0]?.content).toEqual({ role: 'assistant', content: null })

    const retriedClaim = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message: 'hello' },
    })
    expect(retriedClaim).not.toBeNull()
  })

  it('retry-claims after releasing the top-level run even when a completed child run remains', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Spend cap child run release')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })

    const topLevelRun = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message: 'hello' },
    })
    if (!topLevelRun) throw new Error('failed to claim the top-level run')

    const childRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { tool: 'research' },
      parentAgenticRunId: topLevelRun.id,
    })
    await updateConversationMessageAgenticRunOutput(
      childRun.id,
      { result: 'done' },
      'no_tool_calls',
    )

    const released = await releaseChatConversationMessageAgenticRunClaim({
      conversationMessageId: message.id,
      agenticRunId: topLevelRun.id,
    })
    expect(released).toBe(true)

    const retriedClaim = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message: 'hello' },
    })
    expect(retriedClaim?.id).toBeDefined()
  })
})
