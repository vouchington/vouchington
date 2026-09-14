import { describe, expect, it, beforeAll } from 'vitest'
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
import { applyPostSpamDetectionResults } from './apply-results.mts'
import type { SpamDetectionResult } from './types.mts'

describe('applyPostSpamDetectionResults', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ username: safeUsername('spam-apply') })
  })

  it('applies spam detection results when the content hash still matches', async () => {
    const post = await insertPostFixture('matched')
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(post.id, content_sha256)

    const applied = await applyPostSpamDetectionResults(post.id, content_sha256, makeSpamResult())

    expect(applied).toBe(true)
    await expect(getPostSpamDetectionState(post.id)).resolves.toMatchObject({
      spam_detection_flagged: true,
      spam_detection_score: 0.75,
      spam_detection_results: {
        composite_score: 0.75,
        signals: [
          {
            flagged: true,
            score: 1,
            signal: 'spam_keywords',
          },
        ],
      },
    })
    expect((await getPostSpamDetectionState(post.id))?.spam_detection_created_at).toBeInstanceOf(
      Date,
    )
  })

  it('skips stale spam detection results when the post content hash changed', async () => {
    const post = await insertPostFixture('stale')
    const originalHash = createPostModerationContent(post).content_sha256
    const editedHash = createPostModerationContent({
      ...post,
      markdown: `${post.markdown} edited`,
    }).content_sha256
    await setPostLLMModerationContentSha256(post.id, editedHash)

    const applied = await applyPostSpamDetectionResults(post.id, originalHash, makeSpamResult())

    expect(applied).toBe(false)
    await expect(getPostSpamDetectionState(post.id)).resolves.toMatchObject({
      spam_detection_created_at: null,
      spam_detection_flagged: null,
      spam_detection_results: null,
      spam_detection_score: null,
    })
  })

  async function insertPostFixture(label: string): Promise<Post> {
    const suffix = Math.random().toString(36).slice(2, 10)
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: `Normal post content for ${label} ${suffix}`,
      slug: `spam-apply-${label}-${suffix}`,
      title: `Spam apply ${label} ${suffix}`,
    })
    return (await getPostByAny(postId)) as Post
  }
})

function makeSpamResult(): SpamDetectionResult {
  return {
    composite_score: 0.75,
    flagged: true,
    signals: [{ flagged: true, score: 1, signal: 'spam_keywords' }],
  }
}
