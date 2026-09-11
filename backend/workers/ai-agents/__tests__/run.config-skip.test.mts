import { describe, expect, it, beforeAll } from 'vitest'

import {
  createPostLLMModerator,
  updatePostLLMModerator,
  createOpenAIPostLLMModerationPrompt,
  updateOpenAIPostLLMModerationPrompt,
  getModeratorConfig,
  getPostLLMModeratorBySlug,
  checkExistingModeration,
  insertPostModerationAgent,
} from '@services/moderation'

import { runModeratorOnPost } from '@agents/moderation'

import { processModerationPrompt } from '../processors/process-moderation.mts'

import { createPost } from '@services/posts'

import { createPostModerationContent } from '@services/posts/content'

import { getPostByAny } from '@services/posts/get'

import { getPostElectionVote } from '@services/elections-votes/post'

import { searchPostModerationsByAgent } from '@services/moderation/search-post-moderations'

import { getTopicByAny, upsertTopic } from '@services/topics'

import {
  createTestUser,
  createSystemUser,
  mockAiGeneratedModerationResults,
} from '@voucha/test-helpers'

import type { Post } from '@services/posts/types'

import type { PrivateUser } from '@services/users/types'

describe('runModeratorOnPost config and skip behaviors', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  async function setupModeratorAndPrompt() {
    const random = randomSuffix()
    const systemUser = await createSystemUser(`run-mod-system-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `run-mod-${random}`)
    await updatePostLLMModerator(user, moderator.id, { active: true })
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Run moderation prompt ${random}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt.id, { active: true })
    return { systemUser, moderator, prompt }
  }

  async function setupModeratorBySlugAndPrompt(moderatorSlug: string) {
    const setupUser = await createTestUser()
    const random = randomSuffix()
    let moderator = await getPostLLMModeratorBySlug(moderatorSlug)
    if (!moderator) {
      const systemUser = await createSystemUser(`run-mod-system-${moderatorSlug}-${random}`)
      moderator = await createPostLLMModerator(setupUser, systemUser, moderatorSlug)
    }
    await updatePostLLMModerator(setupUser, moderator.id, { active: true })
    const prompt = await createOpenAIPostLLMModerationPrompt(
      setupUser,
      'openai',
      'gpt-5.4-nano',
      `Run moderation prompt ${moderatorSlug}-${random}`,
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

  it('getModeratorConfig returns null for unknown moderator slug', async () => {
    const result = await getModeratorConfig(`missing-mod-${randomSuffix()}`)
    expect(result).toBeNull()
  })

  it('getModeratorConfig returns active prompt and respects promptId filter', async () => {
    const { moderator } = await setupModeratorAndPrompt()
    const prompt2 = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Run moderation prompt ${randomSuffix()}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt2.id, { active: true })

    const latest = await getModeratorConfig(moderator.slug)
    expect(latest).not.toBeNull()
    expect(latest?.prompt.id).toBe(prompt2.id)

    const filtered = await getModeratorConfig(moderator.slug, prompt2.id)
    expect(filtered).not.toBeNull()
    expect(filtered?.prompt.id).toBe(prompt2.id)
  })

  it('checkExistingModeration returns existing moderation result', async () => {
    const { prompt, moderator } = await setupModeratorAndPrompt()
    const post = await createPost(user, {
      title: `Moderation query ${randomSuffix()}`,
      markdown: `Moderation query content ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)
    const results = { flagged: true, reason: 'test-reason' }
    const moderation = await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt.id,
      moderator.id,
      results,
      results.flagged,
    )
    expect(moderation).not.toBeNull()
    const existing = await checkExistingModeration(post.id, content_sha256, prompt.id)
    expect(existing).not.toBeNull()
    expect(existing?.post_id).toBe(moderation?.post_id)
    expect(existing?.flagged).toBe(true)
  })

  it('runModeratorOnPost skips when moderator is missing', async () => {
    const testUser = await createTestUser()
    const post = await createPost(testUser, {
      title: `Missing moderator ${randomSuffix()}`,
      markdown: `Missing moderator content ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const result = await runModeratorOnPost(post as Post, `missing-${randomSuffix()}`)
    expect(result.skipped).toBe(true)
    expect(result.moderation_id).toBeNull()
    expect(result.error).toBe('Moderator not found or not active')
  })

  it('runModeratorOnPost skips when no content is available', async () => {
    const { moderator } = await setupModeratorAndPrompt()
    const post = await createPost(user, {
      title: `No content ${randomSuffix()}`,
      markdown: `Will be cleared ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const noContentPost = { ...post, title: '', markdown: '' } as Post
    const result = await runModeratorOnPost(noContentPost, moderator.slug)
    expect(result.skipped).toBe(true)
    expect(result.moderation_id).toBeNull()
  })

  it('runModeratorOnPost returns existing moderation result', async () => {
    const { moderator, prompt } = await setupModeratorAndPrompt()
    const post = await createPost(user, {
      title: `Existing moderation ${randomSuffix()}`,
      markdown: `Existing moderation content ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)
    const results = { flagged: true, reason: 'test-existing' }
    const moderationId = await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt.id,
      moderator.id,
      results,
      results.flagged,
    )
    expect(moderationId).not.toBeNull()
    const postWithModerationData = {
      ...post,
      openai_omni_moderation_created_at: new Date(),
      openai_omni_moderation_flagged: false,
    } as Post
    const result = await runModeratorOnPost(postWithModerationData, moderator.slug, {
      promptId: prompt.id,
    })
    expect(result.skipped).toBe(true)
    expect(result.moderation_id).toStrictEqual(moderationId)
    expect(result.flagged).toBe(true)
  })

  it('runModeratorOnPost skips when OpenAI moderation already flagged', async () => {
    const { moderator } = await setupModeratorAndPrompt()
    const post = await createPost(user, {
      title: `OpenAI flagged post ${randomSuffix()}`,
      markdown: `OpenAI flagged content ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const flaggedPost = { ...post, openai_omni_moderation_flagged: true } as Post
    const result = await runModeratorOnPost(flaggedPost, moderator.slug)
    expect(result.skipped).toBe(true)
    expect(result.moderation_id).toBeNull()
    expect(result.error).toBe('Skipped: OpenAI moderation already flagged')
  })

  it('runModeratorOnPost tags self-promotion topic when flagged', async () => {
    await ensureTopicExists('self-promotion')
    const {
      moderator,
      prompt,
      user: testUser,
    } = await setupModeratorBySlugAndPrompt('self-promotion')
    const post = await createPost(testUser, {
      title: `Self-promotion post ${randomSuffix()}`,
      markdown: `Self-promotion content ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const result = await runModeratorOnPost(post as Post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Self-promotion detected' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })
    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.tagged_topics).toEqual(['self-promotion'])
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof processModerationPrompt)
  void (0 as unknown as typeof getPostByAny)
  void (0 as unknown as typeof getPostElectionVote)
  void (0 as unknown as typeof searchPostModerationsByAgent)
  void (0 as unknown as typeof mockAiGeneratedModerationResults)
})
