import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
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

async function addModToCommunity(communityId: string, modId: string) {
  await insertTestCommunityMember({ communityId, userId: modId, role: 'moderator' })
}

describe('openModInternalThread', () => {
  let owner: PrivateUser
  let mod1: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    mod1 = await createTestUser()
    postAuthor = await createTestUser()
    reporter = await createTestUser()
  })

  it('creates a new thread with mod participants for a report', async () => {
    const community = await createTestCommunity(owner.id)
    await addModToCommunity(community.id, mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `mod-thread-new-report-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Mod Thread New Report',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const thread = await openModInternalThread(owner.id, {
      communityId: community.id,
      reportId,
    })

    expect(thread.channel_type).toBe('mod_internal')
    expect(thread.community_id).toBe(community.id)
    expect(thread.moderation_report_id).toBe(reportId)

    const participants = await getTestConversationParticipants(thread.id)
    const adminIds = participants.reduce<string[]>((acc, p) => {
      if (p.role === 'admin') acc.push(p.user_id)
      return acc
    }, [])
    expect(adminIds).toContain(owner.id)
    expect(adminIds).toContain(mod1.id)
  })

  it('returns existing open thread when called a second time (open-or-fetch)', async () => {
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `mod-thread-idempotent-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Mod Thread Idempotent',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const thread1 = await openModInternalThread(owner.id, { communityId: community.id, reportId })
    const thread2 = await openModInternalThread(owner.id, { communityId: community.id, reportId })

    expect(thread2.id).toBe(thread1.id)
  })

  it('does NOT add subject user as participant', async () => {
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `mod-thread-no-subject-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Mod Thread No Subject',
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
    expect(participantIds).not.toContain(reporter.id)
    expect(participantIds).not.toContain(postAuthor.id)
  })

  it('adds caller as participant even if not community member (site staff)', async () => {
    const siteStaff = await createTestUser()
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `mod-thread-staff-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Mod Thread Staff',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const thread = await openModInternalThread(siteStaff.id, {
      communityId: community.id,
      reportId,
    })

    const participants = await getTestConversationParticipants(thread.id)
    const staffParticipant = participants.find(p => p.user_id === siteStaff.id)
    expect(staffParticipant?.role).toBe('admin')
  })
})

describe('openModInternalThread - validation', () => {
  it('rejects when neither reportId nor postId is provided', async () => {
    await expect(openModInternalThread('user-id', { communityId: 'community-id' })).rejects.toThrow(
      'Exactly one of reportId or postId must be set',
    )
  })
})
