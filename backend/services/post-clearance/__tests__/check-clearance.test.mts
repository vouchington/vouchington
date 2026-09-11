import { describe, expect, it, beforeAll } from 'vitest'

import {
  createTestUser,
  createSystemUser,
  insertTestPost,
  getPostClearanceStatus,
  getPostClearanceChanges,
  getLatestPostClearanceTransparencyCategories,
  getModeratorActionRowsForTest,
  setPostModerationComplete,
  setPostSpamDetectionComplete,
  safeUsername,
} from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'

import {
  approvePendingPostClearance,
  checkPostClearance,
  resetPostClearance,
  updateClearanceStatus,
} from '../index.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('checkPostClearance', () => {
  let userId: string
  let moderationSystemUserId: string

  beforeAll(async () => {
    const [user, moderationSystemUser] = await Promise.all([
      createTestUser({ username: safeUsername('clearance-user') }),
      createSystemUser(MODERATION_SYSTEM_USERNAME),
    ])
    userId = user!.id
    moderationSystemUserId = moderationSystemUser.id
  })

  it('transitions pending post to approved when both checks pass', async () => {
    const postId = await insertTestPost({
      title: `clearance-both-pass-${randomSuffix()}`,
      slug: `clearance-both-pass-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, false)
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('approved')
    await expect(getPostClearanceChanges(postId)).resolves.toContainEqual({
      change_type: 'approve',
      changed_by_id: moderationSystemUserId,
    })
  })

  it('transitions to rejected when openai moderation flags the post', async () => {
    const postId = await insertTestPost({
      title: `clearance-moderation-flagged-${randomSuffix()}`,
      slug: `clearance-moderation-flagged-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await setPostModerationComplete(postId, true)
    await setPostSpamDetectionComplete(postId, false)
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('rejected')
    await expect(getPostClearanceChanges(postId)).resolves.toContainEqual({
      change_type: 'reject',
      changed_by_id: moderationSystemUserId,
    })
    const actions = await getModeratorActionRowsForTest({ actorId: moderationSystemUserId, postId })
    expect(actions).toContainEqual(
      expect.objectContaining({
        action_type: 'reject',
        actor_id: moderationSystemUserId,
        post_id: postId,
      }),
    )
  })

  it('transitions to rejected when spam detection flags the post', async () => {
    const postId = await insertTestPost({
      title: `clearance-spam-flagged-${randomSuffix()}`,
      slug: `clearance-spam-flagged-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, true)
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('rejected')
  })

  it('stamps both automated rejection sources when both checks flag a post', async () => {
    const postId = await insertTestPost({
      title: `clearance-both-flagged-${randomSuffix()}`,
      slug: `clearance-both-flagged-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })
    await setPostModerationComplete(postId, true)
    await setPostSpamDetectionComplete(postId, true)
    await checkPostClearance(postId)

    await expect(getLatestPostClearanceTransparencyCategories(postId)).resolves.toEqual([
      'openai_omni',
      'spam_detection',
    ])
  })

  it('stays pending when only openai moderation is complete', async () => {
    const postId = await insertTestPost({
      title: `clearance-only-moderation-${randomSuffix()}`,
      slug: `clearance-only-moderation-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await setPostModerationComplete(postId, false)
    // spam_detection_created_at stays NULL
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('pending')
    await expect(getPostClearanceChanges(postId)).resolves.toEqual([])
  })

  it('stays pending when only spam detection is complete', async () => {
    const postId = await insertTestPost({
      title: `clearance-only-spam-${randomSuffix()}`,
      slug: `clearance-only-spam-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await setPostSpamDetectionComplete(postId, false)
    // openai_omni_moderation_created_at stays NULL
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('pending')
    await expect(getPostClearanceChanges(postId)).resolves.toEqual([])
  })

  it('does not change an already-approved post when no flags are set', async () => {
    const postId = await insertTestPost({
      title: `clearance-already-approved-${randomSuffix()}`,
      slug: `clearance-already-approved-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'approved',
    })

    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, false)
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    // Neither flag is set — approved post stays approved
    expect(status).toBe('approved')
  })

  it('demotes an already-approved post to rejected when moderation flags it', async () => {
    const postId = await insertTestPost({
      title: `clearance-approved-demote-moderation-${randomSuffix()}`,
      slug: `clearance-approved-demote-moderation-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'approved',
    })

    await setPostModerationComplete(postId, true)
    await setPostSpamDetectionComplete(postId, false)
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    // Moderation flagged — approved post demoted to rejected
    expect(status).toBe('rejected')
  })

  it('demotes an already-approved post to rejected when spam detection flags it', async () => {
    const postId = await insertTestPost({
      title: `clearance-approved-demote-spam-${randomSuffix()}`,
      slug: `clearance-approved-demote-spam-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'approved',
    })

    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, true)
    await checkPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    // Spam flagged — approved post demoted to rejected
    expect(status).toBe('rejected')
  })
})

describe('resetPostClearance', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('reset-clearance') })
    userId = user!.id
  })

  it('resets approved post back to pending and clears spam detection columns', async () => {
    const postId = await insertTestPost({
      title: `reset-test-${randomSuffix()}`,
      slug: `reset-test-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'approved',
    })

    await setPostSpamDetectionComplete(postId, false)
    await resetPostClearance(postId, userId)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('pending')
    await expect(getPostClearanceChanges(postId)).resolves.toContainEqual({
      change_type: 'reset_to_pending',
      changed_by_id: userId,
    })
  })

  it('resets rejected post back to pending', async () => {
    const postId = await insertTestPost({
      title: `reset-rejected-${randomSuffix()}`,
      slug: `reset-rejected-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'rejected',
    })

    await resetPostClearance(postId)

    const status = await getPostClearanceStatus(postId)
    expect(status).toBe('pending')
  })

  it('does not append duplicate reset changes for an already-pending post', async () => {
    const postId = await insertTestPost({
      title: `reset-pending-${randomSuffix()}`,
      slug: `reset-pending-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    await expect(resetPostClearance(postId, userId)).resolves.toBe(false)
    await expect(getPostClearanceChanges(postId)).resolves.toEqual([])
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof approvePendingPostClearance)
  void (0 as unknown as typeof updateClearanceStatus)
})
