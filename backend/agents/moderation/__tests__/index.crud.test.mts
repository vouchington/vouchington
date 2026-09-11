import { it, expect, beforeAll, describe } from 'vitest'
import {
  hasPostModerationAgent,
  insertPostModerationAgent,
  createOpenAIPostLLMModerationPrompt,
  getOpenAIPostLLMModerationPromptById,
  createPostLLMModerator,
  updateOpenAIPostLLMModerationPrompt,
} from '@services/moderation'
import { createPost } from '@services/posts'
import { createPostModerationContent } from '@services/posts/content'
import { createTestUser, createSystemUser, getModerationPromptStatus } from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'

describe('index.crud', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('createOpenAIPostLLMModerationPrompt inserts and is readable', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`helper-mod-${random}`)
    const moderator = await createPostLLMModerator(user!, systemUser, `helper-mod-${random}`)
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      `Helper prompt ${random}`,
      moderator.id,
    )
    const fetched = await getOpenAIPostLLMModerationPromptById(prompt.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe(prompt.id)
  })

  it('activate/deactivate helpers update current prompt', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`activation-mod-${random}`)
    const moderator = await createPostLLMModerator(user!, systemUser, `activation-mod-${random}`)
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      `Activation prompt ${random}`,
      moderator.id,
    )
    const activated = await updateOpenAIPostLLMModerationPrompt(user!, prompt.id, { active: true })
    expect(activated?.activated_at).toBeInstanceOf(Date)
    expect(activated?.deactivated_at).toBeNull()

    const activeStatus = await getModerationPromptStatus(prompt.id)
    expect(activeStatus?.activated_at).toBeInstanceOf(Date)
    expect(activeStatus?.deactivated_at).toBeNull()

    const deactivated = await updateOpenAIPostLLMModerationPrompt(user!, prompt.id, {
      active: false,
    })
    expect(deactivated?.deactivated_at).toBeInstanceOf(Date)

    const inactiveStatus = await getModerationPromptStatus(prompt.id)
    expect(inactiveStatus?.deactivated_at).toBeInstanceOf(Date)
  })

  it('insertOpenAIPostLLMModeration stores results and hasOpenAIPostLLMModeration finds it', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`insert-mod-${random}`)
    const moderator = await createPostLLMModerator(user!, systemUser, `insert-mod-${random}`)
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      `Insert prompt ${random}`,
      moderator.id,
    )
    const post = await createPost(user!, {
      title: `Insert moderation ${random}`,
      markdown: `Insert moderation content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)

    const results = { flagged: false, reason: `Safe ${random}` }
    const moderationId = await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt.id,
      moderator.id,
      results,
      false,
    )

    expect(moderationId).toBeDefined()

    const exists = await hasPostModerationAgent(post.id, content_sha256, prompt.id)
    expect(exists).toBe(true)
  })
})
