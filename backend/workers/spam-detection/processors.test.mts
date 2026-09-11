import { describe, expect, it, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import {
  createTestUser,
  getPostSpamDetectionState,
  insertTestPost,
  safeUsername,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { processSpamDetection } from './processors.mts'

describe('processSpamDetection', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ username: safeUsername('spam-processor') })
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

    await expect(processSpamDetection(postId)).resolves.toBe(true)

    const state = await getPostSpamDetectionState(postId)
    expect(state?.spam_detection_created_at).toBeInstanceOf(Date)
    expect(state?.spam_detection_flagged).toBe(false)
    expect(state?.spam_detection_results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          flagged: false,
          signal: 'spam_keywords',
        }),
      ]),
    )
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
    await setPostLLMModerationContentSha256(postId, Buffer.alloc(32, 1))

    await expect(processSpamDetection(postId)).resolves.toBe(false)

    await expect(getPostSpamDetectionState(postId)).resolves.toMatchObject({
      spam_detection_created_at: null,
      spam_detection_flagged: null,
    })
  })

  it('returns false before analysis when the queued content hash is stale', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: `A normal discussion about rewards ${suffix}`,
      slug: `spam-processor-queued-stale-${suffix}`,
      title: `Spam processor queued stale ${suffix}`,
    })
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)

    await expect(processSpamDetection(postId, Buffer.alloc(32, 3).toString('hex'))).resolves.toBe(
      false,
    )

    await expect(getPostSpamDetectionState(postId)).resolves.toMatchObject({
      spam_detection_created_at: null,
      spam_detection_flagged: null,
    })
  })
})
