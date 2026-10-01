import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import {
  ClientGeneratedTurnIdentityConflictError,
  createClientGeneratedChatTurn,
  createConversation,
  createConversationMessage,
  getConversationByCreatedByAndTitle,
  getConversationById,
  getConversationsByCreatedById,
  getConversationMessagesByConversationId,
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
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'user',
      content: 'Hello',
    })
    expect(message.id).toBeDefined()
    expect(message.content).toEqual({ role: 'user', content: 'Hello' })
    expect(message.conversation_id).toBe(conversation.id)
    expect(message.created_by_id).toBe(user.id)
  })

  it('getConversationMessagesByConversationId retrieves messages', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message1 = await createConversationMessage(conversation.id, user.id, {
      role: 'user',
      content: 'Hello',
    })
    const message2 = await createConversationMessage(conversation.id, user.id, {
      role: 'user',
      content: 'World',
    })
    const retrieved = await getConversationMessagesByConversationId(conversation.id)

    expect(retrieved).toHaveLength(2)
    expect(retrieved.map(m => m.id)).toContain(message1.id)
    expect(retrieved.map(m => m.id)).toContain(message2.id)
  })

  it('createClientGeneratedChatTurn stores the user and assistant messages', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Local model')

    const result = await createClientGeneratedChatTurn({
      userMessageId: user.id,
      assistantMessageId: conversation.id,
      conversationId: conversation.id,
      createdById: user.id,
      message: 'Summarize my rewards profile',
      assistantContent: 'Use transferable points first.',
      modelProvider: 'apple_foundation',
      modelName: 'apple-foundation-system',
    })

    expect(result.userMessage.content).toEqual({
      role: 'user',
      content: 'Summarize my rewards profile',
      turn_key: expect.any(String),
    })
    expect(result.assistantMessage.content).toEqual({
      role: 'assistant',
      content: 'Use transferable points first.',
      turn_key: result.userMessage.content?.turn_key,
      model_provider: 'apple_foundation',
      model_name: 'apple-foundation-system',
    })
  })

  it('createClientGeneratedChatTurn stores phi-silica for windows_foundry', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Windows local model')

    const result = await createClientGeneratedChatTurn({
      ...turnParams(user.id, conversation.id),
      modelProvider: 'windows_foundry',
      modelName: 'phi-silica',
    })

    expect(result.assistantMessage.content).toMatchObject({
      model_provider: 'windows_foundry',
      model_name: 'phi-silica',
    })
  })

  it('createClientGeneratedChatTurn stores exact OpenAI-compatible model text', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'OpenAI-compatible local model')

    const result = await createClientGeneratedChatTurn({
      ...turnParams(user.id, conversation.id),
      modelProvider: 'openai_compatible',
      modelName: 'gpt-oss-20b-local',
    })

    expect(result.assistantMessage.content).toMatchObject({
      model_provider: 'openai_compatible',
      model_name: 'gpt-oss-20b-local',
    })
  })

  it('createClientGeneratedChatTurn does not wait on an incomplete assistant placeholder', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Pending placeholder')
    await createConversationMessage(conversation.id, user.id, { role: 'assistant', content: null })

    await createClientGeneratedChatTurn(turnParams(user.id, conversation.id))

    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(3)
  })

  it('createClientGeneratedChatTurn replays an identical retry and rejects a changed model', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Retry model')
    const params = {
      ...turnParams(user.id, conversation.id),
      modelProvider: 'openai_compatible' as const,
      modelName: 'gpt-oss-20b-local',
    }
    const first = await createClientGeneratedChatTurn(params)

    const replay = await createClientGeneratedChatTurn(params)
    expect(replay.assistantMessage.id).toBe(first.assistantMessage.id)
    await expect(
      createClientGeneratedChatTurn({ ...params, modelName: 'another-local-model' }),
    ).rejects.toBeInstanceOf(ClientGeneratedTurnIdentityConflictError)
    await expect(
      createClientGeneratedChatTurn({ ...params, modelProvider: 'apple_foundation' }),
    ).rejects.toBeInstanceOf(ClientGeneratedTurnIdentityConflictError)

    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(2)
  })
})

function turnParams(userId: string, conversationId: string) {
  return {
    userMessageId: userId,
    assistantMessageId: conversationId,
    conversationId,
    createdById: userId,
    message: 'Summarize my rewards profile',
    assistantContent: 'Use transferable points first.',
    modelProvider: 'apple_foundation' as const,
    modelName: 'apple-foundation-system',
  }
}
