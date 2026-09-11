import { describe, expect, it, beforeAll } from 'vitest'

import {
  createTestUser,
  insertTestPost,
  getPostClearanceStatus,
  getPostClearanceChanges,
  getLatestPostClearanceMetadata,
  getLatestTestModerationTrainingFeedback,
  setPostModerationComplete,
  setPostSpamDetectionComplete,
  safeUsername,
} from '@voucha/test-helpers'

import {
  approvePendingPostClearance,
  checkPostClearance,
  resetPostClearance,
  updateClearanceStatus,
} from '../index.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('approvePendingPostClearance', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('approve-pending') })
    userId = user!.id
  })

  it('approves pending posts and records an approve change', async () => {
    const postId = await insertTestPost({
      title: `approve-pending-${randomSuffix()}`,
      slug: `approve-pending-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await expect(approvePendingPostClearance(postId, userId)).resolves.toBe(true)

    await expect(getPostClearanceStatus(postId)).resolves.toBe('approved')
    await expect(getPostClearanceChanges(postId)).resolves.toEqual([
      { change_type: 'approve', changed_by_id: userId },
    ])
  })

  it.each(['approved', 'rejected', 'in_review'] as const)(
    'does not append a change when the post is already %s',
    async clearanceStatus => {
      const postId = await insertTestPost({
        title: `approve-non-pending-${clearanceStatus}-${randomSuffix()}`,
        slug: `approve-non-pending-${clearanceStatus}-${randomSuffix()}`,
        createdById: userId,
        markdown: 'test',
        clearanceStatus,
      })
      const changesBefore = await getPostClearanceChanges(postId)

      await expect(approvePendingPostClearance(postId, userId)).resolves.toBe(false)

      await expect(getPostClearanceStatus(postId)).resolves.toBe(clearanceStatus)
      await expect(getPostClearanceChanges(postId)).resolves.toEqual(changesBefore)
    },
  )
})

describe('updateClearanceStatus', () => {
  let userId: string
  let adminUser: Awaited<ReturnType<typeof createTestUser>>

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('update-clearance') })
    userId = user!.id
    adminUser = await createTestUser({
      username: safeUsername('update-clearance-admin'),
      administrator: true,
    })
  })

  it('admin can override status to approved', async () => {
    const postId = await insertTestPost({
      title: `override-to-approved-${randomSuffix()}`,
      slug: `override-to-approved-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'rejected',
    })

    await updateClearanceStatus(postId, 'approved', adminUser!.id)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('approved')
    await expect(getPostClearanceChanges(postId)).resolves.toContainEqual({
      change_type: 'approve',
      changed_by_id: adminUser!.id,
    })
  })

  it('labels clean admin approvals as true negatives', async () => {
    const postId = await insertTestPost({
      title: `clean-approval-${randomSuffix()}`,
      slug: `clean-approval-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await updateClearanceStatus(postId, 'approved', adminUser!.id)

    const feedback = await getLatestTestModerationTrainingFeedback({
      postId,
      sourceType: 'community_review',
      humanAction: 'clearance_approved',
    })
    expect(feedback?.label).toBe('true_negative')
  })

  it('admin can override status to rejected', async () => {
    const postId = await insertTestPost({
      title: `override-to-rejected-${randomSuffix()}`,
      slug: `override-to-rejected-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'approved',
    })

    await updateClearanceStatus(postId, 'rejected', adminUser!.id)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('rejected')
  })

  it('does not attribute a manual reject of an automated-flagged post to that source', async () => {
    const postId = await insertTestPost({
      title: `manual-reject-flagged-${randomSuffix()}`,
      slug: `manual-reject-flagged-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })
    await setPostModerationComplete(postId, true)

    await updateClearanceStatus(postId, 'rejected', adminUser!.id)

    await expect(getLatestPostClearanceMetadata(postId)).resolves.toEqual({})
  })

  it('can set status to in_review', async () => {
    const postId = await insertTestPost({
      title: `in-review-${randomSuffix()}`,
      slug: `in-review-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await updateClearanceStatus(postId, 'in_review')

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('in_review')
    await expect(getPostClearanceChanges(postId)).resolves.toContainEqual({
      change_type: 'mark_in_review',
      changed_by_id: null,
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof setPostModerationComplete)
  void (0 as unknown as typeof setPostSpamDetectionComplete)
  void (0 as unknown as typeof checkPostClearance)
  void (0 as unknown as typeof resetPostClearance)
})
