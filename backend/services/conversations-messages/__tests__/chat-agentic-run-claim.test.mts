import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  claimChatConversationMessageAgenticRun,
  createConversation,
  createConversationMessage,
} from '../create.mts'
import { failChatEnqueue, finalizeChatAgenticRun } from '../update.mts'
import { getConversationMessageAgenticRunById } from '../agentic-runs.mts'
import { randomUUID } from 'node:crypto'
import { softDeleteConversation } from '../conversations.mts'
import { getConversationMessagesByConversationId } from '../messages.mts'
import { updateConversationMessageContent } from '../update-message.mts'

describe('claimChatConversationMessageAgenticRun', () => {
  it('allows only one concurrent claim per assistant message', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Concurrent claim')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const claim = () =>
      claimChatConversationMessageAgenticRun({
        conversationId: conversation.id,
        conversationMessageId: message.id,
        modelName: 'gpt-5.4-nano',
        modelProvider: 'openai',
        input: { message: 'hello' },
      })

    const results = await Promise.all([claim(), claim()])

    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('does not claim an errored assistant placeholder', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Errored placeholder')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
      error: 'The response could not start. Please try again.',
    })

    await expect(
      claimChatConversationMessageAgenticRun({
        conversationId: conversation.id,
        conversationMessageId: message.id,
        modelName: 'gpt-5.4-nano',
        modelProvider: 'openai',
        input: { message: 'hello' },
      }),
    ).resolves.toBeUndefined()
  })

  it('rolls back the run transition when its assistant message cannot be finalized', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Atomic finalization')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const run = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    if (!run) throw new Error('Expected chat run claim')

    await expect(
      finalizeChatAgenticRun({
        id: run.id,
        conversationId: conversation.id,
        conversationMessageId: randomUUID(),
        content: 'answer',
        terminationReason: 'no_tool_calls',
      }),
    ).rejects.toThrow('Chat assistant message was unavailable')

    await expect(getConversationMessageAgenticRunById(run.id)).resolves.toMatchObject({
      status: 'running',
    })
  })

  it('rolls back run and message finalization when cursor persistence cannot update', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Atomic cursor finalization')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const run = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    if (!run) throw new Error('Expected chat run claim')
    await softDeleteConversation(conversation.id, user.id)

    await expect(
      finalizeChatAgenticRun({
        id: run.id,
        conversationId: conversation.id,
        conversationMessageId: message.id,
        content: 'answer',
        terminationReason: 'no_tool_calls',
        conversationLastResponseId: 'response-1',
      }),
    ).rejects.toThrow('Chat conversation was unavailable')

    await expect(getConversationMessageAgenticRunById(run.id)).resolves.toMatchObject({
      status: 'running',
    })
    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages[0]?.content).toEqual({ role: 'assistant', content: null })
  })

  it('keeps route enqueue failure when it terminalizes before the worker', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Route enqueue failure wins')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const run = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    if (!run) throw new Error('Expected chat run claim')

    await expect(
      failChatEnqueue({
        conversationId: conversation.id,
        conversationMessageId: message.id,
        error: 'The response could not start. Please try again.',
      }),
    ).resolves.toBe(true)
    await expect(
      finalizeChatAgenticRun({
        id: run.id,
        conversationId: conversation.id,
        conversationMessageId: message.id,
        content: 'late answer',
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(false)

    await expect(getConversationMessageAgenticRunById(run.id)).resolves.toMatchObject({
      status: 'failed',
      error: { error: 'The response could not start. Please try again.' },
    })
    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages[0]?.content).toEqual({
      role: 'assistant',
      content: null,
      error: 'The response could not start. Please try again.',
    })
  })

  it('keeps worker success when it terminalizes before route enqueue failure', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Worker completion wins')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const run = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    if (!run) throw new Error('Expected chat run claim')
    await finalizeChatAgenticRun({
      id: run.id,
      conversationId: conversation.id,
      conversationMessageId: message.id,
      content: 'answer',
      terminationReason: 'no_tool_calls',
    })

    await expect(
      failChatEnqueue({
        conversationId: conversation.id,
        conversationMessageId: message.id,
        error: 'The response could not start. Please try again.',
      }),
    ).resolves.toBe(false)

    await expect(getConversationMessageAgenticRunById(run.id)).resolves.toMatchObject({
      status: 'completed',
    })
    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages[0]?.content).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('rolls back enqueue failure when the assistant placeholder is unavailable', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Missing enqueue placeholder')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const run = await claimChatConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    if (!run) throw new Error('Expected chat run claim')
    await updateConversationMessageContent(conversation.id, message.id, {
      role: 'assistant',
      content: 'already finalized',
    })

    await expect(
      failChatEnqueue({
        conversationId: conversation.id,
        conversationMessageId: message.id,
        error: 'The response could not start. Please try again.',
      }),
    ).rejects.toThrow('Chat assistant message was unavailable during enqueue failure')
    await expect(getConversationMessageAgenticRunById(run.id)).resolves.toMatchObject({
      status: 'running',
    })
  })
})
