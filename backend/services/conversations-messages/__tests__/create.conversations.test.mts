import { describe, expect, it } from 'vitest'
import {
  createSystemUser,
  createTestConversationMessage,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  ClientGeneratedTurnIdentityConflictError,
  createClientGeneratedChatTurn,
  createConversation,
  getConversationById,
  getConversationsByCreatedById,
  getConversationMessagesByConversationId,
  softDeleteConversation,
  updateConversationTitle,
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

  it('updateConversationTitle returns the updated row and null for a deleted conversation', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Original title')

    const updated = await updateConversationTitle(conversation.id, 'Updated title', user.id)
    expect(updated).toMatchObject({
      id: conversation.id,
      title: 'Updated title',
      updated_by_id: user.id,
    })

    await softDeleteConversation(conversation.id, user.id)
    await expect(
      updateConversationTitle(conversation.id, 'Ignored title', user.id),
    ).resolves.toBeNull()
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

  it('getConversationMessagesByConversationId retrieves messages', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Test Conversation')
    const message1 = await createTestConversationMessage({
      conversationId: conversation.id,
      createdById: user.id,
      content: {
        role: 'user',
        content: 'Hello',
      },
    })
    const message2 = await createTestConversationMessage({
      conversationId: conversation.id,
      createdById: user.id,
      content: {
        role: 'user',
        content: 'World',
      },
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
      provenance: WEB_PROVENANCE,
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
    await createTestConversationMessage({
      conversationId: conversation.id,
      createdById: user.id,
      content: {
        role: 'assistant',
        content: null,
      },
    })

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
    provenance: WEB_PROVENANCE,
    message: 'Summarize my rewards profile',
    assistantContent: 'Use transferable points first.',
    modelProvider: 'apple_foundation' as const,
    modelName: 'apple-foundation-system',
  }
}
