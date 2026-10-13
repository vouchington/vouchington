import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestImage, softDeleteUser } from '@voucha/test-helpers'
import { setTestUserProfileImage } from '@voucha/test-helpers/entities/media-surface-writes'
import {
  allowTestUserProfileImageDelivery,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers/entities/image-surface-placements'
import {
  createTestGroupConversation,
  removeTestConversationParticipant,
} from '@voucha/test-helpers/entities/conversations'
import { addConversationParticipant, getConversationParticipants } from './index.mts'

describe('conversation participant profile placements', () => {
  it.each([false, true])('projects only deliverable placements (allowed: %s)', async allowed => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const newUser = await createTestUser()
    const imageId = await insertTestImage(newUser.id)
    await setTestUserProfileImage(newUser.id, imageId)
    if (allowed) await allowTestUserProfileImageDelivery({ userId: newUser.id, imageId })
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })

    const added = await addConversationParticipant(owner.id, conversationId, newUser.id)
    const roster = await getConversationParticipants(conversationId)
    const listed = roster.find(participant => participant.user_id === newUser.id)
    const [placement] = await getTestImageSurfacePlacements({ userId: newUser.id, imageId })
    const expected = allowed
      ? {
          image_id: imageId,
          placement_id: placement!.placement_id,
          placement_revision: placement!.placement_revision,
        }
      : null
    expect(added.profile_image_placement).toEqual(expected)
    expect(listed?.profile_image_placement).toEqual(added.profile_image_placement)

    await setTestUserProfileImage(newUser.id, null)
    const cleared = await getConversationParticipants(conversationId)
    expect(cleared.find(participant => participant.user_id === newUser.id)).toMatchObject({
      profile_image_id: null,
      profile_image_placement: null,
    })
  })

  it('keeps deleted participant identities private and paginates active rows', async () => {
    const owner = await createTestUser()
    const deleted = await createTestUser()
    const removed = await createTestUser()
    const imageId = await insertTestImage(deleted.id)
    await setTestUserProfileImage(deleted.id, imageId)
    await allowTestUserProfileImageDelivery({ userId: deleted.id, imageId })
    const { id: conversationId } = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [deleted.id, removed.id],
    })
    await softDeleteUser(deleted.id)
    await removeTestConversationParticipant(conversationId, removed.id)

    const first = await getConversationParticipants(conversationId, { limit: 1 })
    expect(first).toHaveLength(2) // One result plus the pagination sentinel.
    expect(first.map(participant => participant.user_id)).not.toContain(removed.id)
    expect(first.find(participant => participant.user_id === deleted.id)).toMatchObject({
      username: null,
      profile_image_id: null,
      profile_image_placement: null,
    })
    const second = await getConversationParticipants(conversationId, {
      after: { id: first[0]!.id },
      limit: 1,
    })
    expect(second.map(participant => participant.id)).toEqual([first[1]!.id])
  })
})
