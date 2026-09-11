import { describe, it, expect } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  findOrCreateDirectConversation,
  createGroupConversation,
  createConversationMessage,
} from '../create.mts'
import { getConversationParticipants } from '../get.mts'

describe('findOrCreateDirectConversation', () => {
  it('creates a new direct_message conversation between two users', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(conversation.channel_type).toBe('direct_message')
    expect(conversation.id).toBeTruthy()

    const participants = await getConversationParticipants(conversation.id)
    expect(participants).toHaveLength(2)
    const userIds = participants.map(p => p.user_id).sort()
    expect(userIds).toEqual([sender.id, recipient.id].sort())
  })

  it('returns existing conversation on second call (idempotent)', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const first = await findOrCreateDirectConversation(sender.id, recipient.id)
    const second = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(first.id).toBe(second.id)
  })

  it('returns existing conversation when called with reversed roles', async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()

    const first = await findOrCreateDirectConversation(userA.id, userB.id)
    const second = await findOrCreateDirectConversation(userB.id, userA.id)

    expect(first.id).toBe(second.id)
  })
})

describe('createGroupConversation', () => {
  it('creates a direct_message conversation with N+1 participants', async () => {
    const owner = await createTestUser()
    const recipient1 = await createTestUser()
    const recipient2 = await createTestUser()

    const conversation = await createGroupConversation(owner.id, [recipient1.id, recipient2.id])

    expect(conversation.channel_type).toBe('direct_message')

    const participants = await getConversationParticipants(conversation.id)
    expect(participants).toHaveLength(3)

    const ownerParticipant = participants.find(p => p.user_id === owner.id)
    expect(ownerParticipant?.role).toBe('owner')

    const memberIds = participants
      .reduce<(string | null)[]>((acc, p) => {
        if (p.role === 'member') acc.push(p.user_id)
        return acc
      }, [])
      .sort()
    expect(memberIds).toEqual([recipient1.id, recipient2.id].sort())
  })
})

describe('createConversationMessage', () => {
  it('creates a message with kind=message in the conversation', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)
    const message = await createConversationMessage(sender.id, conversation.id, 'Hello!')

    expect(message.id).toBeTruthy()
    expect(message.conversation_id).toBe(conversation.id)
    expect(message.body_text).toBe('Hello!')
    expect(message.created_by_id).toBe(sender.id)
  })
})
