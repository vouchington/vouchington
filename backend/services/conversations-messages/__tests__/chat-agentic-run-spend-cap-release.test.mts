import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
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

describe('releaseChatConversationMessageAgenticRunClaim', () => {
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

  it('retry-claims after releasing a top-level run that has no child runs', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Spend cap release without children')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const run = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message: 'hello' },
    })
    if (!run) throw new Error('failed to claim the run')

    await expect(
      releaseChatConversationMessageAgenticRunClaim({
        conversationMessageId: message.id,
        agenticRunId: run.id,
      }),
    ).resolves.toBe(true)

    const retriedClaim = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message: 'hello' },
    })
    expect(retriedClaim).not.toBeUndefined()
  })
})
