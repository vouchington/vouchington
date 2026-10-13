import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestBlock,
  insertTestLocalFollow,
  insertTestMute,
  setTestUserDirectMessagesAudience,
} from '@voucha/test-helpers'
import { createTestGroupConversation } from '@voucha/test-helpers/entities/conversations'
import { addConversationParticipant } from './index.mts'

describe('addConversationParticipant messaging guard', () => {
  it('throws 403 when the added user has blocked the adder', async () => {
    const owner = await createTestUser()
    const blocker = await createTestUser()
    await insertTestBlock(blocker.id, owner.id)
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    await expect(
      addConversationParticipant(owner.id, conversationId, blocker.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws 403 when the adder has muted the added user', async () => {
    const owner = await createTestUser()
    const muted = await createTestUser()
    await insertTestMute(owner.id, muted.id)
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    await expect(
      addConversationParticipant(owner.id, conversationId, muted.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws 403 when the added user accepts messages from nobody', async () => {
    const owner = await createTestUser()
    const recipient = await createTestUser()
    await setTestUserDirectMessagesAudience(recipient.id, 'nobody')
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    await expect(
      addConversationParticipant(owner.id, conversationId, recipient.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('applies the followers audience to the added user', async () => {
    const owner = await createTestUser()
    const recipient = await createTestUser()
    await setTestUserDirectMessagesAudience(recipient.id, 'followers')
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })

    await expect(
      addConversationParticipant(owner.id, conversationId, recipient.id),
    ).rejects.toMatchObject({ status: 403 })

    await insertTestLocalFollow(owner.id, recipient.id)
    const participant = await addConversationParticipant(owner.id, conversationId, recipient.id)
    expect(participant.user_id).toBe(recipient.id)
  })
})
