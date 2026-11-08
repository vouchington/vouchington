import { describe, it, expect, beforeAll } from 'vitest'
import {
  WEB_PROVENANCE,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityVacation,
  insertTestPost,
  insertTestModerationReport,
  getTestConversationParticipants,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { createConversationMessage } from '@services/messaging/create'
import { openModInternalThread } from '../create.mts'
import { assertLiveModInternalReader } from '../access.mts'

const vacationStart = new Date('2030-07-31T23:59:59.000Z')
const vacationEnd = new Date('2030-08-01T00:00:01.000Z')

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

async function openReportThread(
  ownerId: string,
  communityId: string,
  authorId: string,
  reporterId: string,
  slug: string,
) {
  const postId = await insertTestPost({
    createdById: authorId,
    slug,
    title: slug,
    markdown: 'body',
    communityId,
  })
  const reportId = await insertTestModerationReport({
    reporterUserId: reporterId,
    entityType: 'post',
    entityId: postId,
  })
  return openModInternalThread(ownerId, { communityId, reportId })
}

describe('mod_internal live staff access', () => {
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

  it('authorizes readers from live community staff membership even without a participant row', async () => {
    const community = await createTestCommunity(owner.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: activeMod.id,
      role: 'moderator',
    })
    const outsider = await createTestUser()

    await expect(assertLiveModInternalReader(activeMod.id, community.id)).resolves.toBeUndefined()
    await expect(assertLiveModInternalReader(outsider.id, community.id)).rejects.toMatchObject({
      status: 403,
    })
    await removeTestCommunityMember(community.id, activeMod.id)
    await expect(assertLiveModInternalReader(activeMod.id, community.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('does not snapshot moderators when the thread opens', async () => {
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
      slug: `vacation-open-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Vacation open',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    let observations = 0
    const thread = await openModInternalThread(
      owner.id,
      { communityId: community.id, reportId },
      undefined,
      {
        clock: () => {
          observations += 1
          return vacationStart
        },
      },
    )
    const participantIds = (await getTestConversationParticipants(thread.id)).map(p => p.user_id)
    expect(observations).toBe(1)
    expect(participantIds).toContain(owner.id)
    expect(participantIds).not.toContain(activeMod.id)
    expect(participantIds).not.toContain(vacationMod.id)
    expect(participantIds).not.toContain(reporter.id)
    expect(participantIds).not.toContain(postAuthor.id)
  })

  it('admits a live moderator on first send and refuses a moderator on vacation', async () => {
    const community = await createTestCommunity(owner.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: activeMod.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: vacationMod.id,
      role: 'moderator',
    })
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: vacationMod.id,
      startsAt: '2020-01-01T00:00:00.000Z',
    })
    const thread = await openReportThread(
      owner.id,
      community.id,
      postAuthor.id,
      reporter.id,
      `vacation-send-${crypto.randomUUID().slice(0, 8)}`,
    )

    const message = await createConversationMessage(
      activeMod.id,
      WEB_PROVENANCE,
      thread.id,
      'joining',
    )
    expect(message.created_by_id).toBe(activeMod.id)
    await expect(
      createConversationMessage(vacationMod.id, WEB_PROVENANCE, thread.id, 'away'),
    ).rejects.toMatchObject({ status: 403 })

    const participantIds = (await getTestConversationParticipants(thread.id)).map(p => p.user_id)
    expect(participantIds).toContain(owner.id)
    expect(participantIds).toContain(activeMod.id)
    expect(participantIds).not.toContain(vacationMod.id)
  })

  it('lets the opener send after their vacation starts', async () => {
    const community = await createTestCommunity(owner.id)
    const thread = await openReportThread(
      owner.id,
      community.id,
      postAuthor.id,
      reporter.id,
      `vacation-opener-${crypto.randomUUID().slice(0, 8)}`,
    )
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: owner.id,
      startsAt: '2020-01-01T00:00:00.000Z',
    })
    const message = await createConversationMessage(owner.id, WEB_PROVENANCE, thread.id, 'still')
    expect(message.body_text).toBe('still')
  })

  async function openVacationBoundary(offset: number) {
    const community = await createTestCommunity(owner.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: vacationMod.id,
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
      title: 'Vacation boundary',
      markdown: 'Pending review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: postAuthor.id,
    })
    const thread = await openModInternalThread(owner.id, { communityId: community.id, postId })
    const send = createConversationMessage(vacationMod.id, WEB_PROVENANCE, thread.id, 'boundary', {
      observedTime: new Date(vacationStart.getTime() + offset),
    })
    const participantIds = () =>
      getTestConversationParticipants(thread.id).then(rows => rows.map(row => row.user_id))
    return { send, participantIds }
  }

  it.each([
    { label: 'before start', offset: -1 },
    { label: 'at end', offset: 2000 },
  ] as const)('send-time vacation $label admits the moderator', async ({ offset }) => {
    const { send, participantIds } = await openVacationBoundary(offset)
    await expect(send).resolves.toMatchObject({ created_by_id: vacationMod.id })
    const ids = await participantIds()
    expect(ids).toContain(vacationMod.id)
    expect(ids).toContain(owner.id)
    expect(ids).not.toContain(postAuthor.id)
  })

  it.each([
    { label: 'at start', offset: 0 },
    { label: 'before end', offset: 1999 },
  ] as const)('send-time vacation $label refuses the moderator', async ({ offset }) => {
    const { send, participantIds } = await openVacationBoundary(offset)
    await expect(send).rejects.toMatchObject({ status: 403 })
    const ids = await participantIds()
    expect(ids).not.toContain(vacationMod.id)
    expect(ids).toContain(owner.id)
    expect(ids).not.toContain(postAuthor.id)
  })

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
