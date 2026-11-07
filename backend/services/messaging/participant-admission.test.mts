import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { countTestConversationParticipantRows } from '@voucha/test-helpers/entities/conversation-participant-rows'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
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
