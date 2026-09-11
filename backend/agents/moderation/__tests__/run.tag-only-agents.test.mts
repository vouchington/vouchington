import { describe, expect, it } from 'vitest'
import {
  createOpenAIPostLLMModerationPrompt,
  createPostLLMModerator,
  getPostLLMModeratorBySlug,
  updateOpenAIPostLLMModerationPrompt,
  updatePostLLMModerator,
} from '@services/moderation'
import { runModeratorOnPost } from '@agents/moderation'
import { createPost } from '@services/posts'
import { getPostElectionVote } from '@services/elections-votes/post'
import { getTopicByAny, upsertTopic } from '@services/topics'
import { createSystemUser, createTestUser } from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'

describe('runModeratorOnPost tag-only agents', () => {
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  async function setupModeratorBySlugAndPrompt(moderatorSlug: string) {
    const setupUser = await createTestUser()
    const random = randomSuffix()
    let moderator = await getPostLLMModeratorBySlug(moderatorSlug)
    if (!moderator) {
      const systemUser = await createSystemUser(`tag-only-system-${moderatorSlug}-${random}`)
      moderator = await createPostLLMModerator(setupUser, systemUser, moderatorSlug)
    }
    await updatePostLLMModerator(setupUser, moderator.id, {
      active: true,
      onFlagAction: 'none',
    })
    const prompt = await createOpenAIPostLLMModerationPrompt(
      setupUser,
      'openai',
      'gpt-5.4-nano',
      `Tag-only moderation prompt ${moderatorSlug}-${random}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(setupUser, prompt.id, { active: true })
    return { user: setupUser, moderator, prompt }
  }

  async function ensureTopicExists(topicSlug: string) {
    const existingTopic = await getTopicByAny(topicSlug)
    if (existingTopic) return
    await upsertTopic(topicSlug, topicSlug)
  }

  async function expectTagOnlyModeration(moderatorSlug: string, reason: string) {
    await ensureTopicExists(moderatorSlug)
    const { moderator, prompt, user } = await setupModeratorBySlugAndPrompt(moderatorSlug)
    const post = await createPost(user, {
      title: `Tag-only post ${moderatorSlug} ${randomSuffix()}`,
      markdown: `Tag-only content ${moderatorSlug} ${randomSuffix()}`,
      post_type: 'discussion',
    })

    const result = await runModeratorOnPost(post as Post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.tagged_topics).toEqual([moderatorSlug])

    const vote = await getPostElectionVote(moderator.system_user_id, post.id)
    expect(vote?.choice).not.toBe('dislike')
  }

  it('tags click-bait without downvoting when flagged', async () => {
    await expectTagOnlyModeration('click-bait', 'Title intentionally withholds key information.')
  })

  it('tags vague-post without downvoting when flagged', async () => {
    await expectTagOnlyModeration(
      'vague-post',
      'Post does not include enough context for readers to help.',
    )
  })

  it('tags shit-post without downvoting when flagged', async () => {
    await expectTagOnlyModeration(
      'shit-post',
      'Post is a low-effort joke without useful substance.',
    )
  })
})
