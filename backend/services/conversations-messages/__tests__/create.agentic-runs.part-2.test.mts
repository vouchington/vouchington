import { describe, expect, it } from 'vitest'

import { createSystemUser } from '@voucha/test-helpers'

import {
  createConversation,
  createConversationMessage,
  createConversationMessageAgenticRun,
  createConversationMessageAgenticRunEvent,
  getConversationMessageAgenticRunById,
  getConversationMessageAgenticRunEventsByRunId,
  getConversationMessageAgenticRunsByConversationMessageId,
  getLatestConversationMessageAgenticRunByConversationMessageId,
  hasActiveChatTurnByConversationId,
  hasRunningAgenticRunByConversationId,
  updateConversationMessageAgenticRunError,
  updateConversationMessageAgenticRunOutput,
  updateConversationMessageAgenticRunEventOutput,
  updateConversationMessageContent,
} from '../index.mts'

describe('conversations-messages service (agentic runs)', () => {
  it('updateConversationMessageAgenticRunOutput updates output', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    const agenticRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const output = { role: 'assistant', content: 'Hello, world!' }
    await updateConversationMessageAgenticRunOutput(agenticRun.id, output, 'no_tool_calls')

    const updated = await getConversationMessageAgenticRunById(agenticRun.id)
    expect(updated!.output).toEqual(output)
    expect(updated!.status).toBe('completed')
    expect(updated!.completed_at).toBeInstanceOf(Date)
    expect(updated!.failed_at).toBeNull()
  })

  it('updateConversationMessageAgenticRunError updates error and derived status', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    const agenticRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const error = { message: 'Test error', code: 'TEST_ERROR' }
    await updateConversationMessageAgenticRunError(agenticRun.id, error)

    const updated = await getConversationMessageAgenticRunById(agenticRun.id)
    expect(updated!.error).toEqual(error)
    expect(updated!.status).toBe('failed')
    expect(updated!.completed_at).toBeNull()
    expect(updated!.failed_at).toBeInstanceOf(Date)
  })

  it('hasRunningAgenticRunByConversationId derives running status from timestamps', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    const agenticRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })

    await expect(hasRunningAgenticRunByConversationId(conversation.id)).resolves.toBe(true)

    await updateConversationMessageAgenticRunOutput(agenticRun.id, { done: true }, 'no_tool_calls')

    await expect(hasRunningAgenticRunByConversationId(conversation.id)).resolves.toBe(false)
  })

  it('getLatestConversationMessageAgenticRunByConversationMessageId returns the newest run', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'First' },
    })
    const latestRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'claude-sonnet-5',
      modelProvider: 'anthropic',
      input: { content: 'Second' },
    })

    const latest = await getLatestConversationMessageAgenticRunByConversationMessageId(message.id)

    expect(latest?.id).toBe(latestRun.id)
    expect(latest?.model_provider).toBe('anthropic')
  })

  it('does not treat errored assistant placeholders as active chat turns', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })

    await expect(hasActiveChatTurnByConversationId(conversation.id)).resolves.toBe(true)

    await updateConversationMessageContent(conversation.id, message.id, {
      role: 'assistant',
      content: null,
      error: 'enqueue failed',
    })

    await expect(hasActiveChatTurnByConversationId(conversation.id)).resolves.toBe(false)
  })

  it('updateConversationMessageAgenticRunEventOutput updates event output', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    const agenticRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const event = await createConversationMessageAgenticRunEvent({
      conversationMessageAgenticRunId: agenticRun.id,
      type: 'function_call',
      input: {
        name: 'test-tool',
        arguments: {},
      },
    })
    const output = { result: 'test result' }
    await updateConversationMessageAgenticRunEventOutput(agenticRun.id, event.id, output)

    const events = await getConversationMessageAgenticRunEventsByRunId(agenticRun.id)
    expect(events[0].output).toEqual(output)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getConversationMessageAgenticRunsByConversationMessageId)
})
