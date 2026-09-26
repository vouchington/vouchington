import { describe, expect, it, beforeAll } from 'vitest'
import {
  createPostLLMModerator,
  updatePostLLMModerator,
  createOpenAIPostLLMModerationPrompt,
  updateOpenAIPostLLMModerationPrompt,
} from '@services/moderation'
import { runModeratorOnPost } from '@agents/moderation'
import { createPost } from '@services/posts'
import { getPostByAny } from '@services/posts/get'
import {
  createTestUser,
  createSystemUser,
  getPostClearanceChanges,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'

describe('runModeratorOnPost on_flag_action', () => {
  let user: PrivateUser
  let moderationSystemUserId: string

  beforeAll(async () => {
    const [createdUser, moderationSystemUser] = await Promise.all([
      createTestUser(),
      createSystemUser(MODERATION_SYSTEM_USERNAME),
    ])
    user = createdUser!
    moderationSystemUserId = moderationSystemUser.id
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  async function setupModerator(onFlagAction: 'none' | 'review_queue') {
    const random = randomSuffix()
    const systemUser = await createSystemUser(`flag-action-system-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `flag-action-mod-${random}`)
    await updatePostLLMModerator(user, moderator.id, { active: true, onFlagAction })

    const prompt = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Flag action test prompt ${random}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt.id, { active: true })

    return { systemUser, moderator, prompt }
  }

  async function makePost(): Promise<Post> {
    const r = randomSuffix()
    const post = await createPost(WEB_PROVENANCE, user, {
      title: `Flag action test ${r}`,
      markdown: 'Test content for moderation',
      post_type: 'discussion',
    })
    return post as Post
  }

  it('on_flag_action=review_queue: flagged → clearance in_review', async () => {
    const { moderator, prompt } = await setupModerator('review_queue')
    const post = await makePost()

    const result = await runModeratorOnPost(post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Test flag' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)

    const refreshedPost = await getPostByAny(post.id)
    expect(refreshedPost?.clearance_status).toBe('in_review')
    await expect(getPostClearanceChanges(post.id)).resolves.toContainEqual({
      change_type: 'mark_in_review',
      changed_by_id: moderationSystemUserId,
    })
  })

  it('not flagged → no action regardless of on_flag_action', async () => {
    const { moderator, prompt } = await setupModerator('review_queue')
    const post = await makePost()

    const result = await runModeratorOnPost(post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: { flagged: false, reason: '' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(false)
    expect(result.skipped).toBe(false)

    const refreshedPost = await getPostByAny(post.id)
    expect(refreshedPost?.clearance_status).toBe('pending')
  })

  it('on_flag_action=none: flagged → clearance unchanged', async () => {
    const { moderator, prompt } = await setupModerator('none')
    const post = await makePost()

    const result = await runModeratorOnPost(post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Test flag' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)

    const refreshedPost = await getPostByAny(post.id)
    expect(refreshedPost?.clearance_status).toBe('pending')
  })
})
