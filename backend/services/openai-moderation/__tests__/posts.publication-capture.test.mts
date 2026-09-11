import { createPost } from '@services/posts'
import type { Post } from '@services/posts/types'
import {
  createRandomString,
  createOpenAIModerationResponse,
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  setPostModerationFlaggedForTest,
  updatePostModerationData,
} from '@voucha/test-helpers'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { markPostOpenAIModerationNoContent } from '../persist-post-results.mts'
import { upsertPostOpenAIModeration } from '../posts.mts'

describe('OpenAI moderation publication capture', () => {
  let user: PrivateUser

  beforeAll(async () => {
    const created = await createTestUser()
    if (!created) throw new Error('Expected test user')
    user = created
  })

  it.each([
    { previousFlagged: null, nextFlagged: true },
    { previousFlagged: false, nextFlagged: true },
    { previousFlagged: true, nextFlagged: false },
  ])(
    'captures the $previousFlagged to $nextFlagged public eligibility transition',
    async ({ previousFlagged, nextFlagged }) => {
      const post = await createModerationPost(user)
      if (previousFlagged !== null) {
        await updatePostModerationData(post.id, Buffer.alloc(32), [], previousFlagged)
      }
      const before = await getTestPostPublicationDirtyWorkForScope({
        type: 'post',
        id: post.id,
      })

      await applyModeration(post, nextFlagged)

      const after = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
      expect(Number(after!.generation)).toBeGreaterThan(Number(before!.generation))
      expect(after!.reasons).toContain('post_moderation_flag_changed')
    },
  )

  it.each([
    { previousFlagged: null, nextFlagged: false },
    { previousFlagged: false, nextFlagged: false },
    { previousFlagged: true, nextFlagged: true },
  ])(
    'does not capture the $previousFlagged to $nextFlagged non-transition',
    async ({ previousFlagged, nextFlagged }) => {
      const post = await createModerationPost(user)
      if (previousFlagged !== null) {
        await updatePostModerationData(post.id, Buffer.alloc(32), [], previousFlagged)
      }
      const before = await getTestPostPublicationDirtyWorkForScope({
        type: 'post',
        id: post.id,
      })

      await applyModeration(post, nextFlagged)

      const after = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
      expect(Number(after!.generation)).toBeGreaterThanOrEqual(Number(before!.generation))
      expect(after!.reasons).not.toContain('post_moderation_flag_changed')
    },
  )

  it('captures a flagged to unflagged no-content transition', async () => {
    const post = await createModerationPost(user)
    await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })

    await markPostOpenAIModerationNoContent(post.id)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(work!.reasons).toContain('post_moderation_flag_changed')
  })

  it('does not capture a null to unflagged no-content completion', async () => {
    const post = await createModerationPost(user)

    await markPostOpenAIModerationNoContent(post.id)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(work!.reasons).not.toContain('post_moderation_flag_changed')
  })
})

async function createModerationPost(user: PrivateUser): Promise<Post> {
  const suffix = createRandomString(12)
  return createPost(user, {
    title: `Moderation publication ${suffix}`,
    markdown: `Moderation publication content ${suffix}`,
    post_type: 'discussion',
  })
}

async function applyModeration(post: Post, flagged: boolean): Promise<void> {
  const [result] = createOpenAIModerationResponse(flagged).results
  const createOpenAIModeration = vi.fn<VitestLooseMock>().mockResolvedValue([result])
  await upsertPostOpenAIModeration(post, { dependencies: { createOpenAIModeration } })
  expect(createOpenAIModeration).toHaveBeenCalledOnce()
}
