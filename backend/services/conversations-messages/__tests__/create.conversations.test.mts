import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import { createHostedChatTurn } from '../chat-turns.mts'
import {
  createClientGeneratedChatTurn,
  createConversation,
  createConversationMessage,
  createConversationMessageAgenticRun,
  getConversationByCreatedByAndTitle,
  getConversationById,
  getConversationsByCreatedById,
  getConversationMessagesByConversationId,
  updateConversationLastResponseId,
} from '../index.mts'

describe('conversations-messages service (conversations)', () => {
  it('createConversation creates a conversation', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    expect(conversation.id).toBeDefined()
    expect(conversation.title).toBe('Test Conversation')
    expect(conversation.created_by_id).toBe(user.id)
    expect(conversation.created_at).toBeInstanceOf(Date)
  })

  it('createConversation with empty title', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id)
    expect(conversation.id).toBeDefined()
    expect(conversation.title).toBe('')
    expect(conversation.created_by_id).toBe(user.id)
    expect(conversation.created_at).toBeInstanceOf(Date)
  })

  it('getConversationById retrieves a conversation by id', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const retrieved = await getConversationById(conversation.id)

    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(conversation.id)
    expect(retrieved?.title).toBe('Test Conversation')
  })

  it('getConversationByCreatedByAndTitle retrieves a conversation', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const title = `Test Conversation ${random}`
    const conversation = await createConversation(user.id, title)
    const retrieved = await getConversationByCreatedByAndTitle(user.id, title)

    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(conversation.id)
    expect(retrieved?.title).toBe(title)
  })

  it('getConversationsByCreatedById retrieves conversations by user', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation1 = await createConversation(user.id, 'Conversation 1')
    const conversation2 = await createConversation(user.id, 'Conversation 2')
    const retrieved = await getConversationsByCreatedById(user.id)

    expect(retrieved).toHaveLength(2)
    expect(retrieved.map(c => c.id)).toContain(conversation1.id)
    expect(retrieved.map(c => c.id)).toContain(conversation2.id)
  })

  it('createConversationMessage creates a message', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message = await createConversationMessage(conversation.id, user.id, 'Hello')
    expect(message.id).toBeDefined()
    expect(message.content).toBe('Hello')
    expect(message.conversation_id).toBe(conversation.id)
    expect(message.created_by_id).toBe(user.id)
  })

  it('getConversationMessagesByConversationId retrieves messages', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message1 = await createConversationMessage(conversation.id, user.id, 'Hello')
    const message2 = await createConversationMessage(conversation.id, user.id, 'World')
    const retrieved = await getConversationMessagesByConversationId(conversation.id)

    expect(retrieved).toHaveLength(2)
    expect(retrieved.map(m => m.id)).toContain(message1.id)
    expect(retrieved.map(m => m.id)).toContain(message2.id)
  })

  it('createClientGeneratedChatTurn clears stale OpenAI response chain state', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Local model')
    await updateConversationLastResponseId(conversation.id, 'response_stale')

    const result = await createClientGeneratedChatTurn({
      conversationId: conversation.id,
      createdById: user.id,
      message: 'Summarize my rewards profile',
      assistantContent: 'Use transferable points first.',
      modelProvider: 'apple_foundation',
      modelName: 'apple-foundation-system',
    })

    const updated = await getConversationById(conversation.id)
    expect(updated?.last_response_id).toBeNull()
    expect(result.userMessage.content).toEqual({
      role: 'user',
      content: 'Summarize my rewards profile',
    })
    expect(result.assistantMessage.content).toEqual({
      role: 'assistant',
      content: 'Use transferable points first.',
    })
    expect(result.agenticRun).toMatchObject({
      conversation_id: conversation.id,
      conversation_message_id: result.assistantMessage.id,
      model_name: 'apple-foundation-system',
      model_provider: 'apple_foundation',
      status: 'completed',
      input: { message: 'Summarize my rewards profile' },
      output: { response: 'Use transferable points first.' },
    })
    expect(result.agenticRun.termination_reason).toBe('no_tool_calls')
  })

  it('createClientGeneratedChatTurn stores phi-silica for windows_foundry', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Windows local model')

    const result = await createClientGeneratedChatTurn({
      conversationId: conversation.id,
      createdById: user.id,
      message: 'Summarize my rewards profile',
      assistantContent: 'Use transferable points first.',
      modelProvider: 'windows_foundry',
      modelName: 'phi-silica',
    })

    expect(result.agenticRun).toMatchObject({
      model_name: 'phi-silica',
      model_provider: 'windows_foundry',
    })
  })

  it('createClientGeneratedChatTurn stores exact OpenAI-compatible model text', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'OpenAI-compatible local model')

    const result = await createClientGeneratedChatTurn({
      conversationId: conversation.id,
      createdById: user.id,
      message: 'Summarize my rewards profile',
      assistantContent: 'Use transferable points first.',
      modelProvider: 'openai_compatible',
      modelName: 'gpt-oss-20b-local',
    })

    expect(result.agenticRun).toMatchObject({
      model_name: 'gpt-oss-20b-local',
      model_provider: 'openai_compatible',
    })
  })

  it('createHostedChatTurn creates a locked user and assistant placeholder turn', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Hosted model')

    const result = await createHostedChatTurn({
      conversationId: conversation.id,
      createdById: user.id,
      message: 'Hello',
    })

    expect(result.userMessage.content).toEqual({ role: 'user', content: 'Hello' })
    expect(result.assistantMessage.content).toEqual({ role: 'assistant', content: null })
    await expect(
      createHostedChatTurn({
        conversationId: conversation.id,
        createdById: user.id,
        message: 'Second',
      }),
    ).rejects.toThrow('A message is already being processed')
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(2)
  })

  it('createClientGeneratedChatTurn rejects active turns inside the insert transaction', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Local model')
    const assistantMessage = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: assistantMessage.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message: 'Hello' },
    })

    await expect(
      createClientGeneratedChatTurn({
        conversationId: conversation.id,
        createdById: user.id,
        message: 'Summarize my rewards profile',
        assistantContent: 'Use transferable points first.',
        modelProvider: 'apple_foundation',
        modelName: 'apple-foundation-system',
      }),
    ).rejects.toThrow('A message is already being processed')

    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(1)
  })
})
