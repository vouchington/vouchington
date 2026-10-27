import { describe, expect, it, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import {
  createTestUser,
  createReferralProgramFixture,
  createSystemUser,
  getTestPenaltiesByPostId,
  getPostSpamDetectionState,
  insertTestPost,
  safeUsername,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { getTestPostModerationAttemptStateForPost } from '@voucha/test-helpers/post-moderation-attempt-state'
import type { PrivateUser } from '@services/users/types'
import {
  beginPostModerationAttempt,
  recordPostModerationDisposition,
} from '@services/post-clearance'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import { processSpamDetection } from './processors.mts'

describe('processSpamDetection', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ username: safeUsername('spam-processor') })
    await createSystemUser(MODERATION_SYSTEM_USERNAME)
  })

  it('returns false when the post no longer exists', async () => {
    await expect(processSpamDetection(randomUUID())).resolves.toBe(false)
  })

  it('applies results for the currently matching post content', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: `A normal discussion about rewards ${suffix}`,
      slug: `spam-processor-${suffix}`,
      title: `Spam processor ${suffix}`,
    })
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)
    const attempt = await beginPostModerationAttempt(postId, 'spam_detection')

    await expect(processSpamDetection(attempt!.version_id)).resolves.toBe(true)

    const state = await getPostSpamDetectionState(postId)
    expect(state?.spam_detection_created_at).toBeInstanceOf(Date)
    expect(state?.spam_detection_flagged).toBe(false)
    expect(state?.spam_detection_results).toMatchObject({
      signals: expect.arrayContaining([
        expect.objectContaining({
          flagged: false,
          signal: 'spam_keywords',
        }),
      ]),
    })
  })

  it('returns false when the post content hash changed before apply', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: `A normal discussion about rewards ${suffix}`,
      slug: `spam-processor-stale-${suffix}`,
      title: `Spam processor stale ${suffix}`,
    })
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)
    const attempt = await beginPostModerationAttempt(postId, 'spam_detection')
    await setPostLLMModerationContentSha256(postId, Buffer.alloc(32, 1))

    await expect(processSpamDetection(attempt!.version_id)).resolves.toBe(false)

    await expect(getPostSpamDetectionState(postId)).resolves.toMatchObject({
      spam_detection_created_at: null,
      spam_detection_flagged: null,
    })
  })

  it('returns false when the version already has a spam disposition', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: `A normal discussion about rewards ${suffix}`,
      slug: `spam-processor-disposed-${suffix}`,
      title: `Spam processor disposed ${suffix}`,
    })
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)
    const attempt = await beginPostModerationAttempt(postId, 'spam_detection')
    await recordPostModerationDisposition({
      versionId: attempt!.version_id,
      source: 'spam_detection',
      attemptId: attempt!.id,
      disposition: 'pass',
      reasonCode: 'provider_pass',
    })

    await expect(processSpamDetection(attempt!.version_id)).resolves.toBe(false)
    await expect(
      getTestPostModerationAttemptStateForPost(postId, 'spam_detection'),
    ).resolves.toEqual({
      completed_at: null,
      attempt_number: 1,
    })
    await expect(getPostSpamDetectionState(postId)).resolves.toMatchObject({
      spam_detection_flagged: false,
    })
  })

  it('penalizes the post author when spam detection finds a referral link', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const referral = await createReferralProgramFixture({
      createdById: user.id,
      hostname: `spam-processor-${suffix}.example.com`,
      pathname: '/ref/%',
      randomSuffix: suffix,
    })
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: `Useful referral: https://${referral.hostname}/ref/${suffix}`,
      slug: `spam-processor-referral-${suffix}`,
      title: `Spam processor referral ${suffix}`,
    })
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)
    const attempt = await beginPostModerationAttempt(postId, 'spam_detection')

    await expect(processSpamDetection(attempt!.version_id)).resolves.toBe(true)

    await expect(getTestPenaltiesByPostId(postId, user.id)).resolves.toEqual([
      expect.objectContaining({ reason: 'referral_link_in_post', user_id: user.id }),
    ])
  })
})
