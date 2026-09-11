import { it, expect, beforeAll, describe } from 'vitest'
import {
  getPostModeratorsNeedingRun,
  insertPostModerationAgent,
} from '../post-moderation-agents.mts'
import {
  createOpenAIPostLLMModerationPrompt,
  updateOpenAIPostLLMModerationPrompt,
  getAllActiveModerationConfigs,
} from '../moderation-prompts.mts'
import { createPostLLMModerator, updatePostLLMModerator } from '../moderators.mts'
import { createPost } from '@services/posts'
import { createPostModerationContent } from '@services/posts/content'
import { createTestUser, createSystemUser } from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'

describe('post-moderation-agents (getPostModeratorsNeedingRun)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('getPostModeratorsNeedingRun - returns all moderators when none have run', async () => {
    const random = randomSuffix()

    // Create two moderators
    const systemUser1 = await createSystemUser(`mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(user, systemUser1, `mod-1-${random}`)
    await updatePostLLMModerator(user, moderator1.id, { active: true })

    const systemUser2 = await createSystemUser(`mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(user, systemUser2, `mod-2-${random}`)
    await updatePostLLMModerator(user, moderator2.id, { active: true })

    // Create prompts
    const prompt1 = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Prompt 1 ${random}`,
      moderator1.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt1.id, { active: true })

    const prompt2 = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Prompt 2 ${random}`,
      moderator2.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt2.id, { active: true })

    // Create a post
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    // Get all active configs
    const allConfigs = await getAllActiveModerationConfigs()
    const relevantConfigs = allConfigs.filter(
      c => c.prompt.id === prompt1.id || c.prompt.id === prompt2.id,
    )

    // Get moderators needing to run (should be all of them)
    const needingRun = await getPostModeratorsNeedingRun(post.id, content_sha256, relevantConfigs)

    expect(needingRun.length).toBe(2)
    const slugs = needingRun.map(c => c.moderator_slug).toSorted()
    expect(slugs).toContain(`mod-1-${random}`)
    expect(slugs).toContain(`mod-2-${random}`)
  })

  it('getPostModeratorsNeedingRun - excludes moderators that already ran', async () => {
    const random = randomSuffix()

    // Create two moderators
    const systemUser1 = await createSystemUser(`mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(user, systemUser1, `mod-1-${random}`)
    await updatePostLLMModerator(user, moderator1.id, { active: true })

    const systemUser2 = await createSystemUser(`mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(user, systemUser2, `mod-2-${random}`)
    await updatePostLLMModerator(user, moderator2.id, { active: true })

    // Create prompts
    const prompt1 = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Prompt 1 ${random}`,
      moderator1.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt1.id, { active: true })

    const prompt2 = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Prompt 2 ${random}`,
      moderator2.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt2.id, { active: true })

    // Create a post
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    // Insert moderation result for moderator1
    await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt1.id,
      moderator1.id,
      { flagged: false, reason: `Test ${random}` },
      false,
    )

    // Get all active configs
    const allConfigs = await getAllActiveModerationConfigs()
    const relevantConfigs = allConfigs.filter(
      c => c.prompt.id === prompt1.id || c.prompt.id === prompt2.id,
    )

    // Get moderators needing to run (should only be moderator2)
    const needingRun = await getPostModeratorsNeedingRun(post.id, content_sha256, relevantConfigs)

    expect(needingRun.length).toBe(1)
    expect(needingRun[0].moderator_slug).toBe(`mod-2-${random}`)
  })

  it('getPostModeratorsNeedingRun - returns all moderators when content changes', async () => {
    const random = randomSuffix()

    // Create moderator
    const systemUser = await createSystemUser(`mod-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `mod-${random}`)
    await updatePostLLMModerator(user, moderator.id, { active: true })

    // Create prompt
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Prompt ${random}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt.id, { active: true })

    // Create a post
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Original content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256: originalSha256 } = createPostModerationContent(post as Post)

    // Insert moderation result for original content
    await insertPostModerationAgent(
      post.id,
      originalSha256,
      prompt.id,
      moderator.id,
      { flagged: false, reason: `Test ${random}` },
      false,
    )

    // Simulate content change with different SHA-256
    const newContentSha256 = Buffer.from('different-sha256')

    // Get all active configs
    const allConfigs = await getAllActiveModerationConfigs()
    const relevantConfigs = allConfigs.filter(c => c.prompt.id === prompt.id)

    // Get moderators needing to run with NEW content (should include the moderator)
    const needingRun = await getPostModeratorsNeedingRun(post.id, newContentSha256, relevantConfigs)

    expect(needingRun.length).toBe(1)
    expect(needingRun[0].moderator_slug).toBe(`mod-${random}`)
  })

  it('getPostModeratorsNeedingRun - returns empty array when all moderators have run', async () => {
    const random = randomSuffix()

    // Create moderator
    const systemUser = await createSystemUser(`mod-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `mod-${random}`)
    await updatePostLLMModerator(user, moderator.id, { active: true })

    // Create prompt
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Prompt ${random}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt.id, { active: true })

    // Create a post
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    // Insert moderation result
    await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt.id,
      moderator.id,
      { flagged: false, reason: `Test ${random}` },
      false,
    )

    // Get all active configs
    const allConfigs = await getAllActiveModerationConfigs()
    const relevantConfigs = allConfigs.filter(c => c.prompt.id === prompt.id)

    // Get moderators needing to run (should be empty)
    const needingRun = await getPostModeratorsNeedingRun(post.id, content_sha256, relevantConfigs)

    expect(needingRun.length).toBe(0)
  })

  it('getPostModeratorsNeedingRun - handles empty config list', async () => {
    const random = randomSuffix()

    // Create a post
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    // Get moderators needing to run with empty config list
    const needingRun = await getPostModeratorsNeedingRun(post.id, content_sha256, [])

    expect(needingRun.length).toBe(0)
  })
})
