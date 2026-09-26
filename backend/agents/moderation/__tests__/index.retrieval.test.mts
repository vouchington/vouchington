import { it, expect, beforeAll, describe } from 'vitest'
import {
  createOpenAIPostLLMModerationPrompt,
  getOpenAIPostLLMModerationPromptById,
  createPostLLMModerator,
  updatePostLLMModerator,
  updateOpenAIPostLLMModerationPrompt,
  insertPostModerationAgent,
} from '@services/moderation'
import { createPost } from '@services/posts'
import { createPostModerationContent } from '@services/posts/content'
import {
  createTestUser,
  softDeleteModerationPrompt,
  createSystemUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getPostElectionVote } from '@services/elections-votes/post'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'

describe('index.retrieval', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('getOpenAIPostLLMModerationPromptById returns prompt when it exists', async () => {
    const random = randomSuffix()
    const systemUser = await createSystemUser(`byid-mod-${random}`)
    const moderator = await createPostLLMModerator(user!, systemUser, `byid-mod-${random}`)
    // Create a prompt
    const createdPrompt = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Test prompt',
      moderator.id,
    )
    // Retrieve the prompt by ID
    const retrievedPrompt = await getOpenAIPostLLMModerationPromptById(createdPrompt.id)

    expect(retrievedPrompt).toBeDefined()
    expect(retrievedPrompt).not.toBeNull()
    expect(retrievedPrompt?.id).toBe(createdPrompt.id)
    expect(retrievedPrompt?.model_name).toBe('gpt-5.4-nano')
    expect(retrievedPrompt?.model_provider).toBe('openai')
    expect(retrievedPrompt?.prompt).toBe('Test prompt')
  })

  it('getOpenAIPostLLMModerationPromptById returns null when prompt does not exist', async () => {
    // Use a non-existent UUID
    const nonExistentId = '00000000-0000-0000-0000-000000000000'

    const result = await getOpenAIPostLLMModerationPromptById(nonExistentId)

    expect(result).toBeNull()
  })

  it('getOpenAIPostLLMModerationPromptById returns null when prompt is soft-deleted', async () => {
    const random = randomSuffix()
    const systemUser = await createSystemUser(`soft-deleted-mod-${random}`)
    const moderator = await createPostLLMModerator(user!, systemUser, `soft-deleted-mod-${random}`)
    // Create a prompt
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Test prompt',
      moderator.id,
    )
    // Verify it exists before deletion
    const beforeDelete = await getOpenAIPostLLMModerationPromptById(prompt.id)
    expect(beforeDelete).not.toBeNull()
    expect(beforeDelete?.id).toBe(prompt.id)

    // Soft-delete the prompt
    await softDeleteModerationPrompt(prompt.id)

    // Verify it returns null after deletion
    const afterDelete = await getOpenAIPostLLMModerationPromptById(prompt.id)
    expect(afterDelete).toBeNull()
  })

  it('moderator system user vote can be cast independently of moderation result', async () => {
    const random = randomSuffix()

    const systemUser = await createSystemUser(`vote-test-${random}`)
    const moderator = await createPostLLMModerator(user!, systemUser, `vote-test-${random}`)
    await updatePostLLMModerator(user!, moderator.id, { active: true })

    const prompt = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      `Test prompt ${random}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user!, prompt.id, { active: true })

    const post = await createPost(WEB_PROVENANCE, user!, {
      title: `Test ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)
    const results = { flagged: true, reason: `Test flagged ${random}` }
    const moderationId = await insertPostModerationAgent(
      post.id,
      content_sha256,
      prompt.id,
      moderator.id,
      results,
      true,
    )
    expect(moderationId).toBeDefined()

    // Moderator votes are no longer cast automatically — verify no vote exists by default
    const systemVote = await getPostElectionVote(moderator.system_user_id, post.id)
    expect(systemVote).toBeNull()
  })
})
