import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  countTestConversationParticipantRows,
  getTestConversationParticipantId,
} from '@voucha/test-helpers/entities/conversation-participant-rows'
import { getTestConversationParticipants } from '@voucha/test-helpers/entities/conversations'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { admitConversationParticipants } from './participant-admission.mts'
import {
  addConversationParticipant,
  createGroupConversation,
  removeConversationParticipant,
} from './index.mts'
import {
  conversationParticipantLimitsConfig,
  getConversationParticipantLimit,
} from './participant-limits.mts'

describe('conversation participant admission', () => {
  it('counts removed rows and reactivates one row at the cap', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(conversationParticipantLimitsConfig, {
        participants_per_conversation: 2,
      }),
    )
    const owner = await createTestUser()
    const member = await createTestUser()
    const outsider = await createTestUser()
    const conversation = await createGroupConversation(owner.id, [member.id])
    const originalId = await getTestConversationParticipantId(conversation.id, member.id)

    await expect(
      addConversationParticipant(owner.id, conversation.id, outsider.id),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Conversation has reached the maximum of 2 participants',
    })
    await removeConversationParticipant(owner.id, conversation.id, member.id)
    await expect(
      addConversationParticipant(owner.id, conversation.id, outsider.id),
    ).rejects.toMatchObject({ status: 400 })

    const restored = await addConversationParticipant(owner.id, conversation.id, member.id)
    expect(restored.id).toBe(originalId)
    expect(restored.user_id).toBe(member.id)
    expect(restored.removed_at).toBeNull()
    expect(await countTestConversationParticipantRows(conversation.id)).toBe(2)
  })

  it('rejects a second active add with 409 before growing the conversation', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const conversation = await createGroupConversation(owner.id, [member.id])
    await expect(
      addConversationParticipant(owner.id, conversation.id, member.id),
    ).rejects.toMatchObject({ status: 409 })
    expect(await countTestConversationParticipantRows(conversation.id)).toBe(2)
  })

  it('admits only one of two concurrent users competing for the final slot', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(conversationParticipantLimitsConfig, {
        participants_per_conversation: 3,
      }),
    )
    const owner = await createTestUser()
    const member = await createTestUser()
    const first = await createTestUser()
    const second = await createTestUser()
    const conversation = await createGroupConversation(owner.id, [member.id])

    const outcomes = await Promise.allSettled([
      addConversationParticipant(owner.id, conversation.id, first.id),
      addConversationParticipant(owner.id, conversation.id, second.id),
    ])

    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 400 }),
      }),
    ])
    expect(await countTestConversationParticipantRows(conversation.id)).toBe(3)
  })

  it('reactivates an existing row when the configured limit falls below its row count', async () => {
    const owner = await createTestUser()
    const first = await createTestUser()
    const second = await createTestUser()
    const conversation = await createGroupConversation(owner.id, [first.id, second.id])
    onTestFinished(
      overrideDynamicConfigFieldsForTest(conversationParticipantLimitsConfig, {
        participants_per_conversation: 2,
      }),
    )

    await removeConversationParticipant(owner.id, conversation.id, second.id)
    const restored = await addConversationParticipant(owner.id, conversation.id, second.id)
    expect(restored.removed_at).toBeNull()
    expect(await countTestConversationParticipantRows(conversation.id)).toBe(3)
  })

  it('rolls back a removed-row reactivation when a batch exceeds the cap', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(conversationParticipantLimitsConfig, {
        participants_per_conversation: 3,
      }),
    )
    const owner = await createTestUser()
    const member = await createTestUser()
    const first = await createTestUser()
    const second = await createTestUser()
    const conversation = await createGroupConversation(owner.id, [member.id])
    await removeConversationParticipant(owner.id, conversation.id, member.id)

    await expect(
      withCommittedPostgresTransactionForTest(query =>
        admitConversationParticipants(
          query,
          conversation.id,
          [member.id, first.id, second.id].map(userId => ({ userId, role: 'member' })),
        ),
      ),
    ).rejects.toMatchObject({ status: 400 })
    expect(await countTestConversationParticipantRows(conversation.id)).toBe(2)
    expect(
      (await getTestConversationParticipants(conversation.id)).map(row => row.user_id),
    ).toEqual([owner.id])
  })

  it('returns a conflict for the loser when two requests add the same user', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const newcomer = await createTestUser()
    const conversation = await createGroupConversation(owner.id, [member.id])

    const outcomes = await Promise.allSettled([
      addConversationParticipant(owner.id, conversation.id, newcomer.id),
      addConversationParticipant(owner.id, conversation.id, newcomer.id),
    ])

    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    ])
    expect(await countTestConversationParticipantRows(conversation.id)).toBe(3)
  })

  it('returns a conflict for the loser when two requests reactivate the same user', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const conversation = await createGroupConversation(owner.id, [member.id])
    await removeConversationParticipant(owner.id, conversation.id, member.id)

    const outcomes = await Promise.allSettled([
      addConversationParticipant(owner.id, conversation.id, member.id),
      addConversationParticipant(owner.id, conversation.id, member.id),
    ])

    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    ])
    expect(await countTestConversationParticipantRows(conversation.id)).toBe(2)
  })

  it('does not honor a configured limit above the hard maximum', () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(conversationParticipantLimitsConfig, {
        participants_per_conversation: 51,
      }),
    )
    expect(getConversationParticipantLimit()).toBe(25)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(conversationParticipantLimitsConfig, {
        participants_per_conversation: 50,
      }),
    )
    expect(getConversationParticipantLimit()).toBe(50)
  })
})
