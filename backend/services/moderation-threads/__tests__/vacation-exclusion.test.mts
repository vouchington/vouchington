import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityVacation,
  insertTestPost,
  insertTestModerationReport,
  getTestConversationParticipants,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { openModInternalThread } from '../create.mts'

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

describe('addModParticipants - vacation exclusion', () => {
  let owner: PrivateUser
  let vacationMod: PrivateUser
  let activeMod: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    vacationMod = await createTestUser()
    activeMod = await createTestUser()
    postAuthor = await createTestUser()
    reporter = await createTestUser()
  })

  it('excludes on-vacation mods from new thread participants', async () => {
    const community = await createTestCommunity(owner.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: vacationMod.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: activeMod.id,
      role: 'moderator',
    })
    await insertTestCommunityVacation({ communityId: community.id, userId: vacationMod.id })

    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `vacation-exclusion-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Vacation Exclusion Test',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const thread = await openModInternalThread(owner.id, { communityId: community.id, reportId })
    const participants = await getTestConversationParticipants(thread.id)
    const participantIds = participants.map(p => p.user_id)

    expect(participantIds).not.toContain(vacationMod.id)
    expect(participantIds).toContain(activeMod.id)
    expect(participantIds).toContain(owner.id)
  })

  it('includes a mod whose vacation has expired', async () => {
    const community = await createTestCommunity(owner.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: vacationMod.id,
      role: 'moderator',
    })
    const expiredEndsAt = new Date(Date.now() - 1000).toISOString()
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: vacationMod.id,
      endsAt: expiredEndsAt,
    })

    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `vacation-expired-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Vacation Expired Test',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const thread = await openModInternalThread(owner.id, { communityId: community.id, reportId })
    const participants = await getTestConversationParticipants(thread.id)
    const participantIds = participants.map(p => p.user_id)

    expect(participantIds).toContain(vacationMod.id)
  })
})
