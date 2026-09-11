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
  hasRunningAgenticRunByConversationId,
  updateConversationMessageAgenticRunError,
  updateConversationMessageAgenticRunOutput,
  updateConversationMessageAgenticRunEventOutput,
} from '../index.mts'

describe('conversations-messages service (agentic runs)', () => {
  it('createConversationMessageAgenticRun creates an agentic run', async () => {
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
    expect(agenticRun.id).toBeDefined()
    expect(agenticRun.conversation_id).toBe(conversation.id)
    expect(agenticRun.conversation_message_id).toBe(message.id)
    expect(agenticRun.model_name).toBe('gpt-5.4-nano')
    expect(agenticRun.model_provider).toBe('openai')
    expect(agenticRun.status).toBe('running')
    expect(agenticRun.completed_at).toBeNull()
    expect(agenticRun.failed_at).toBeNull()
  })

  it('getConversationMessageAgenticRunById retrieves an agentic run', async () => {
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
    const retrieved = await getConversationMessageAgenticRunById(agenticRun.id)

    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(agenticRun.id)
    expect(retrieved?.conversation_id).toBe(conversation.id)
  })

  it('createConversationMessageAgenticRunEvent creates an event', async () => {
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
    expect(event.id).toBeDefined()
    expect(event.conversation_message_agentic_run_id).toBe(agenticRun.id)
    expect(event.type).toBe('function_call')
    expect(event.input).toEqual({ name: 'test-tool', arguments: {} })
  })

  it('getConversationMessageAgenticRunEventsByRunId retrieves events', async () => {
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
    const event1 = await createConversationMessageAgenticRunEvent({
      conversationMessageAgenticRunId: agenticRun.id,
      type: 'function_call',
      input: {
        name: 'test-tool-1',
        arguments: {},
      },
    })
    const event2 = await createConversationMessageAgenticRunEvent({
      conversationMessageAgenticRunId: agenticRun.id,
      type: 'function_call',
      input: {
        name: 'test-tool-2',
        arguments: {},
      },
    })
    const events = await getConversationMessageAgenticRunEventsByRunId(agenticRun.id)

    expect(events).toHaveLength(2)
    expect(events.map(e => e.id)).toContain(event1.id)
    expect(events.map(e => e.id)).toContain(event2.id)
  })

  it('getConversationMessageAgenticRunsByConversationMessageId retrieves runs', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    const run1 = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const run2 = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)

    expect(runs).toHaveLength(2)
    expect(runs.map(r => r.id)).toContain(run1.id)
    expect(runs.map(r => r.id)).toContain(run2.id)
  })

  it('getConversationMessageAgenticRunsByConversationMessageId derives terminal statuses', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    const completedRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const failedRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Again' },
    })

    await updateConversationMessageAgenticRunOutput(completedRun.id, { ok: true }, 'no_tool_calls')
    await updateConversationMessageAgenticRunError(failedRun.id, { message: 'Nope' })

    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)

    expect(runs.map(run => [run.id, run.status])).toEqual([
      [completedRun.id, 'completed'],
      [failedRun.id, 'failed'],
    ])
    expect(runs[0].completed_at).toBeInstanceOf(Date)
    expect(runs[0].failed_at).toBeNull()
    expect(runs[1].completed_at).toBeNull()
    expect(runs[1].failed_at).toBeInstanceOf(Date)
  })

  it('getLatestConversationMessageAgenticRunByConversationMessageId retrieves latest run', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const run2 = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const latest = await getLatestConversationMessageAgenticRunByConversationMessageId(message.id)

    expect(latest).toBeDefined()
    expect(latest?.id).toBe(run2.id)
  })

  it('getLatestConversationMessageAgenticRunByConversationMessageId derives failed status', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Hello' },
    })
    const failedRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { content: 'Again' },
    })

    await updateConversationMessageAgenticRunError(failedRun.id, { message: 'Nope' })

    const latest = await getLatestConversationMessageAgenticRunByConversationMessageId(message.id)

    expect(latest?.id).toBe(failedRun.id)
    expect(latest?.status).toBe('failed')
    expect(latest?.failed_at).toBeInstanceOf(Date)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof hasRunningAgenticRunByConversationId)
  void (0 as unknown as typeof updateConversationMessageAgenticRunEventOutput)
})
