import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestGroupConversation } from '@voucha/test-helpers/entities/conversations'
import { getConversationParticipants } from '../index.mts'

describe('createTestGroupConversation', () => {
  it('persists the owner and two distinct members with their roles', async () => {
    const [owner, firstMember, secondMember] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [firstMember.id, secondMember.id],
    })

    const participants = await getConversationParticipants(conversationId)
    expect(participants).toHaveLength(3)
    expect(participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: owner.id, role: 'owner' }),
        expect.objectContaining({ user_id: firstMember.id, role: 'member' }),
        expect.objectContaining({ user_id: secondMember.id, role: 'member' }),
      ]),
    )
  })

  // Duplicate inputs must still reach the unique index; the fixture must not deduplicate them.
  it.each(['duplicate member', 'owner in members'] as const)(
    'rejects a %s with the active-participant unique violation',
    async collision => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const memberUserIds =
        collision === 'duplicate member' ? [member.id, member.id] : [owner.id, member.id]

      await expect(
        createTestGroupConversation({ createdById: owner.id, memberUserIds }),
      ).rejects.toMatchObject({ code: '23505' })
    },
  )
})
