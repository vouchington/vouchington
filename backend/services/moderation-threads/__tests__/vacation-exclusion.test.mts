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
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { openModInternalThread } from '../create.mts'

const vacationStart = new Date('2030-07-31T23:59:59.000Z')
const vacationEnd = new Date('2030-08-01T00:00:01.000Z')
const decisionTime = new Date('2030-08-01T00:00:00.000Z')

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
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: vacationMod.id,
      startsAt: vacationStart.toISOString(),
    })

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

    const thread = await openModInternalThread(
      owner.id,
      { communityId: community.id, reportId },
      undefined,
      { clock: () => decisionTime },
    )
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
    const expiredEndsAt = new Date(decisionTime.getTime() - 1000).toISOString()
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: vacationMod.id,
      startsAt: new Date(decisionTime.getTime() - 2000).toISOString(),
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

    const thread = await openModInternalThread(
      owner.id,
      { communityId: community.id, reportId },
      undefined,
      { clock: () => decisionTime },
    )
    const participants = await getTestConversationParticipants(thread.id)
    const participantIds = participants.map(p => p.user_id)

    expect(participantIds).toContain(vacationMod.id)
  })
  it.each([
    { label: 'before start', offset: -1, included: true },
    { label: 'at start', offset: 0, included: false },
    { label: 'before end', offset: 1999, included: false },
    { label: 'at end', offset: 2000, included: true },
  ] as const)(
    'post-review vacation $label includes moderator=$included',
    async ({ offset, included }) => {
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
      await insertTestCommunityVacation({
        communityId: community.id,
        userId: vacationMod.id,
        startsAt: vacationStart.toISOString(),
        endsAt: vacationEnd.toISOString(),
      })
      const postId = await insertTestPost({
        createdById: postAuthor.id,
        slug: `vacation-boundary-${crypto.randomUUID()}`,
        title: 'Vacation boundary review',
        markdown: 'Pending review.',
        communityId: community.id,
      })
      await insertTestPendingCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: postAuthor.id,
      })
      let observations = 0
      const thread = await openModInternalThread(
        owner.id,
        { communityId: community.id, postId },
        undefined,
        {
          clock: () => {
            observations += 1
            return new Date(vacationStart.getTime() + offset)
          },
        },
      )
      const participants = await getTestConversationParticipants(thread.id)
      const participantIds = participants.map(p => p.user_id)
      expect(participantIds.includes(vacationMod.id)).toBe(included)
      expect(participantIds).toContain(activeMod.id)
      expect(participantIds).toContain(owner.id)
      expect(observations).toBe(1)
    },
  )

  it('rejects an invalid vacation decision clock before looking up a thread', async () => {
    await expect(
      openModInternalThread(
        crypto.randomUUID(),
        { communityId: crypto.randomUUID(), postId: crypto.randomUUID() },
        undefined,
        { clock: () => new Date(Number.NaN) },
      ),
    ).rejects.toBeInstanceOf(RangeError)
  })

  it('preserves a thrown vacation decision clock failure', async () => {
    const failure = new Error('Business clock unavailable')
    await expect(
      openModInternalThread(
        crypto.randomUUID(),
        { communityId: crypto.randomUUID(), postId: crypto.randomUUID() },
        undefined,
        {
          clock: () => {
            throw failure
          },
        },
      ),
    ).rejects.toBe(failure)
  })
})
