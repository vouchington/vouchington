import { it, expect, beforeAll, describe } from 'vitest'
import { hasPostModerationAgent, insertPostModerationAgent } from '../post-moderation-agents.mts'
import { createOpenAIPostLLMModerationPrompt } from '../moderation-prompts.mts'
import { createPostLLMModerator, updatePostLLMModerator } from '../moderators.mts'
import { createPost } from '@services/posts'
import { createPostModerationContent } from '@services/posts/content'
import { createTestUser, createSystemUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'

describe('post-moderation-agents (hasPostModerationAgent and insertPostModerationAgent)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('hasPostModerationAgent - returns true when moderation exists', async () => {
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
    // Create a post
    const post = await createPost(WEB_PROVENANCE, user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    // Insert moderation
    await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt.id,
      moderator.id,
      { flagged: false, reason: `Test ${random}` },
      false,
    )

    // Check if it exists
    const exists = await hasPostModerationAgent(post.id, content_sha256, prompt.id)

    expect(exists).toBe(true)
  })

  it('hasPostModerationAgent - returns false when moderation does not exist', async () => {
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
    // Create a post
    const post = await createPost(WEB_PROVENANCE, user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    // Check if it exists (should be false)
    const exists = await hasPostModerationAgent(post.id, content_sha256, prompt.id)

    expect(exists).toBe(false)
  })

  it('insertPostModerationAgent - successfully inserts moderation', async () => {
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
    // Create a post
    const post = await createPost(WEB_PROVENANCE, user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    // Insert moderation
    const result = await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt.id,
      moderator.id,
      { flagged: true, reason: `Flagged ${random}` },
      true,
    )

    expect(result).not.toBeNull()
    expect(result?.post_id).toBe(post.id)
    expect(result?.input_sha256).toEqual(content_sha256)
    expect(result?.prompt_id).toBe(prompt.id)

    // Verify it exists
    const exists = await hasPostModerationAgent(post.id, content_sha256, prompt.id)
    expect(exists).toBe(true)
  })

  it('insertPostModerationAgent - returns null when content SHA-256 does not match', async () => {
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
    // Create a post
    const post = await createPost(WEB_PROVENANCE, user, {
      title: `Test Post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
    })
    // Use a different SHA-256 that doesn't match the post's current content
    const wrongSha256 = Buffer.from('wrong-sha256')

    // Try to insert moderation with wrong SHA-256
    const result = await insertPostModerationAgent(
      post.id,
      wrongSha256,
      prompt.id,
      moderator.id,
      { flagged: false, reason: `Test ${random}` },
      false,
    )

    // Should return null because the SHA-256 doesn't match
    expect(result).toBeNull()
  })
})
