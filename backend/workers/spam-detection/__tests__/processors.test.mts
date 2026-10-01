import { describe, expect, it } from 'vitest'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import {
  createTestUser,
  getPostSpamDetectionState,
  getTestPostModerationRetryDelayMinutes,
  insertTestPost,
  safeUsername,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { getTestPostModerationAttemptStateForPost } from '@voucha/test-helpers/post-moderation-attempt-state'
import { processSpamDetection } from '../processors.mts'

describe('spam detection query failure recovery', () => {
  it('preserves the database failure and schedules unfinished moderation for retry', async () => {
    const suffix = crypto.randomUUID()
    const user = await createTestUser({ username: safeUsername('spam-recovery') })
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: `A normal discussion about rewards ${suffix}`,
      slug: `spam-recovery-${suffix}`,
      title: `Spam recovery ${suffix}`,
    })
    const post = await getPostByAny(postId)
    if (!post) throw new Error('The owned spam detection post was not created')
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* checkContentHashDuplicate */',
      () => processSpamDetection(postId).catch((err: unknown) => err),
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(result).toBe(error)
    expect(await getTestPostModerationAttemptStateForPost(postId, 'spam_detection')).toEqual({
      failed_at: expect.any(Date),
      error_code: '25P02',
      completed_at: null,
      work_completed_at: null,
      work_lease_token: null,
      work_leased_at: null,
      work_lease_expires_at: null,
    })
    expect(await getTestPostModerationRetryDelayMinutes(postId, 'spam_detection')).toBe(5)
    expect(await getPostSpamDetectionState(postId)).toMatchObject({
      spam_detection_created_at: null,
    })
  })
})
