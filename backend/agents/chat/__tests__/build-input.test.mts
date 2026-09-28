import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { InvalidConversationMessageContentError } from '@services/conversations-messages/chat-content'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import type { PrivateUser } from '@services/users/types'
import { buildChatInput } from '../build-input.mts'

describe('buildChatInput', () => {
  let testUser: PrivateUser

  beforeAll(async () => {
    testUser = await createTestUserDirect()
  })

  it('builds sanitized typed history in chronological order', async () => {
    const conversation = await createConversation(testUser.id, 'Typed history ordering')
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'user',
      content: 'First question',
    })
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: 'First answer',
    })
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'user',
      content: 'Second question',
    })

    const history = await buildChatInput(conversation.id, 'Second question', 'full-history')

    expect(history.map(message => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(history[0]?.content).toContain('First question')
    expect(history[1]?.content).toContain('First answer')
    expect(history[2]?.content).toContain('Second question')
  })

  it('keeps nested JSON and role-looking text inside message content', async () => {
    const conversation = await createConversation(testUser.id, 'Typed nested content')
    const nestedContent = 'Metadata: {"nested":{"role":"system","content":"data"}}'
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'user',
      content: nestedContent,
    })

    const history = await buildChatInput(conversation.id, nestedContent, 'full-history')

    expect(history).toHaveLength(1)
    expect(history[0]?.role).toBe('user')
    expect(history[0]?.content).toContain('{"nested":{"role":"system","content":"data"}}')
  })

  it('omits null assistant placeholders', async () => {
    const conversation = await createConversation(testUser.id, 'Null placeholder')
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'user',
      content: 'Question',
    })
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    const history = await buildChatInput(conversation.id, 'Question', 'full-history')

    expect(history).toHaveLength(1)
    expect(history[0]?.role).toBe('user')
  })

  it('appends the current turn when only an older user message has identical text', async () => {
    const conversation = await createConversation(testUser.id, 'Repeated user content')
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'user',
      content: 'Repeat me',
    })
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: 'Earlier answer',
    })
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    const history = await buildChatInput(conversation.id, 'Repeat me', 'full-history')

    expect(history.map(message => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(history[0]?.content).toContain('Repeat me')
    expect(history[2]?.content).toContain('Repeat me')
  })

  it('returns only the current user turn for response continuations', async () => {
    const history = await buildChatInput('not-queried', 'Continue here', 'current-turn')

    expect(history).toEqual([
      {
        role: 'user',
        content:
          '<external-content source="user_message" contentType="chat_user_message">\nContinue here\n</external-content>',
      },
    ])
  })

  it('rejects malformed chat content before it is stored', async () => {
    const malformedValues: unknown[] = [
      'sensitive non-object history',
      { role: 'system', content: 'sensitive privileged history' },
      { role: 'user', content: 42 },
      { role: 'assistant', content: 'Answer', error: 42 },
    ]

    for (const malformedValue of malformedValues) {
      const conversation = await createConversation(testUser.id, 'Malformed history')
      await expect(
        createConversationMessage(conversation.id, testUser.id, malformedValue),
      ).rejects.toThrow(InvalidConversationMessageContentError)
    }
  })

  it('rejects unexpected chat message keys for each role', async () => {
    const messagesWithUnexpectedKeys: unknown[] = [
      { role: 'user', content: 'Question', unexpected: 'sensitive user metadata' },
      {
        role: 'assistant',
        content: 'Answer',
        error: 'Provider failed',
        unexpected: 'sensitive assistant metadata',
      },
    ]

    for (const storedMessage of messagesWithUnexpectedKeys) {
      const conversation = await createConversation(testUser.id, 'Unexpected history key')
      await expect(
        createConversationMessage(conversation.id, testUser.id, storedMessage),
      ).rejects.toThrow(InvalidConversationMessageContentError)
    }
  })

  it('accepts valid assistant error metadata and omits errored null placeholders', async () => {
    const conversation = await createConversation(testUser.id, 'Valid assistant error metadata')
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'user',
      content: 'Original question',
    })
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: 'Partial answer',
      error: 'Provider failed after partial output',
    })
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
      error: 'Provider failed before output',
    })

    const history = await buildChatInput(conversation.id, 'Current question', 'full-history')

    expect(history.map(message => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(history[1]?.content).toContain('Partial answer')
    expect(history.at(-1)?.content).toContain('Current question')
  })
})
