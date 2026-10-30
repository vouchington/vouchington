import { describe, expect, it, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  getPostClearanceStatus,
  setPostModerationComplete,
  setPostSpamDetectionComplete,
  safeUsername,
} from '@voucha/test-helpers'
import { checkPostClearance, resetPostClearance } from './index.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

/**
 * Integration-level pipeline tests for post clearance.
 * These tests verify multi-step reset then re-check sequences
 * that are not covered in the unit-level check-clearance.test.mts.
 */
describe('post clearance pipeline', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('clearance-pipeline') })
    userId = user!.id
  })

  it('reset then re-check approves a previously rejected post after flags clear', async () => {
    const postId = await insertTestPost({
      title: `pipeline-reset-recheck-${randomSuffix()}`,
      slug: `pipeline-reset-recheck-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'rejected',
    })

    // Post is rejected; reset it back to pending
    const wasReset = await resetPostClearance(postId, userId)
    expect(wasReset).toBe(true)
    expect(await getPostClearanceStatus(postId)).toBe('pending')

    // Now complete both checks with no flags — should approve
    await setPostSpamDetectionComplete(postId, false)
    await setPostModerationComplete(postId, false)
    await checkPostClearance(postId)

    expect(await getPostClearanceStatus(postId)).toBe('approved')
  })

  it('reset then re-check routes a spam flag to review', async () => {
    const postId = await insertTestPost({
      title: `pipeline-reset-spam-${randomSuffix()}`,
      slug: `pipeline-reset-spam-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'approved',
    })

    // Post was approved; reset it back to pending
    const wasReset = await resetPostClearance(postId, userId)
    expect(wasReset).toBe(true)
    expect(await getPostClearanceStatus(postId)).toBe('pending')

    // Spam detected on re-check requires human review.
    await setPostSpamDetectionComplete(postId, true)
    await setPostModerationComplete(postId, false)
    await checkPostClearance(postId)

    expect(await getPostClearanceStatus(postId)).toBe('in_review')
  })
})
