import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestModerationReport,
  insertTestPendingCommunityPostReview,
  getTestModerationReportEscalatedAt,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { escalateModerationQueueItem, deEscalateModerationQueueItem } from '../escalate.mts'

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

describe('escalateModerationQueueItem - validation', () => {
  it('rejects when neither reportId nor postId is provided', async () => {
    await expect(
      escalateModerationQueueItem('user-id', { communityId: 'community-id' }),
    ).rejects.toThrow('Exactly one of reportId or postId must be set')
  })
})

describe('deEscalateModerationQueueItem - validation', () => {
  it('rejects when neither reportId nor postId is provided', async () => {
    await expect(deEscalateModerationQueueItem('user-id', {})).rejects.toThrow(
      'Exactly one of reportId or postId must be set',
    )
  })
})

describe('escalateModerationQueueItem', () => {
  let owner: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    postAuthor = await createTestUser()
    reporter = await createTestUser()
  })

  it('sets escalated_at on the report and opens a mod internal thread', async () => {
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `escalate-report-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Escalate Report',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await escalateModerationQueueItem(owner.id, { communityId: community.id, reportId })

    const escalatedAt = await getTestModerationReportEscalatedAt(reportId)
    expect(escalatedAt).not.toBeNull()
    expect(escalatedAt).not.toBeUndefined()
  })

  it('sets escalated_at on a pending post review', async () => {
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `escalate-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Escalate Post',
      markdown: 'body',
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    await expect(
      escalateModerationQueueItem(owner.id, { communityId: community.id, postId }),
    ).resolves.toBeUndefined()
  })

  it('is idempotent for an already-escalated post (second call succeeds)', async () => {
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `escalate-post-dup-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Escalate Post Dup',
      markdown: 'body',
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    await escalateModerationQueueItem(owner.id, { communityId: community.id, postId })
    await expect(
      escalateModerationQueueItem(owner.id, { communityId: community.id, postId }),
    ).resolves.toBeUndefined()
  })

  it('throws 404 when post review does not exist', async () => {
    const community = await createTestCommunity(owner.id)
    const nonExistentPostId = crypto.randomUUID()
    await expect(
      escalateModerationQueueItem(owner.id, {
        communityId: community.id,
        postId: nonExistentPostId,
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('is idempotent for an already-escalated report (second call succeeds)', async () => {
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `escalate-report-dup-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Escalate Report Dup',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await escalateModerationQueueItem(owner.id, { communityId: community.id, reportId })
    await expect(
      escalateModerationQueueItem(owner.id, { communityId: community.id, reportId }),
    ).resolves.toBeUndefined()
  })

  it('throws 404 when report does not exist', async () => {
    const community = await createTestCommunity(owner.id)
    const nonExistentReportId = crypto.randomUUID()
    await expect(
      escalateModerationQueueItem(owner.id, {
        communityId: community.id,
        reportId: nonExistentReportId,
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('deEscalateModerationQueueItem', () => {
  let owner: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    postAuthor = await createTestUser()
    reporter = await createTestUser()
  })

  it('clears escalated_at on the report', async () => {
    const community = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `deescalate-report-${crypto.randomUUID().slice(0, 8)}`,
      title: 'DeEscalate Report',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await escalateModerationQueueItem(owner.id, { communityId: community.id, reportId })
    await deEscalateModerationQueueItem(owner.id, { communityId: community.id, reportId })

    const escalatedAt = await getTestModerationReportEscalatedAt(reportId)
    expect(escalatedAt).toBeNull()
  })

  it('does not clear escalation through another community scope', async () => {
    const community = await createTestCommunity(owner.id)
    const otherCommunity = await createTestCommunity(owner.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `deescalate-report-cross-community-${crypto.randomUUID().slice(0, 8)}`,
      title: 'DeEscalate Report Cross Community',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await escalateModerationQueueItem(owner.id, { communityId: community.id, reportId })
    await expect(
      deEscalateModerationQueueItem(owner.id, { communityId: otherCommunity.id, reportId }),
    ).rejects.toMatchObject({ status: 403 })

    const escalatedAt = await getTestModerationReportEscalatedAt(reportId)
    expect(escalatedAt).not.toBeNull()
  })
})
