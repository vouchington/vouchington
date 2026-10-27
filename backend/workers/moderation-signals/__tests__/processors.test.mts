import { describe, expect, it } from 'vitest'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import { beginPostModerationAttempt } from '@services/post-clearance'
import {
  createTestUser,
  getPostSpamDetectionState,
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
    const attempt = await beginPostModerationAttempt(postId, 'spam_detection')

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* checkContentHashDuplicate */',
      () => processSpamDetection(attempt!.version_id).catch((err: unknown) => err),
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(result).toBe(error)
    expect(await getTestPostModerationAttemptStateForPost(postId, 'spam_detection')).toEqual({
      completed_at: null,
      attempt_number: 1,
    })
    expect(await getPostSpamDetectionState(postId)).toMatchObject({
      spam_detection_created_at: null,
    })
  })
})
