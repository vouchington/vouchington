import { it, expect, beforeAll, describe } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createOpenAIPostLLMModerationPrompt,
  getOpenAIPostLLMModerationPrompts,
  updateOpenAIPostLLMModerationPrompt,
  createPostLLMModerator,
} from '@services/moderation'
import {
  createTestUser,
  setTestModerationPromptActivatedAt,
  softDeleteModerationPrompt,
  createSystemUser,
  updateAgentPromptIdForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('index.list pagination and filtering', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('getOpenAIPostLLMModerationPrompts respects custom limit', async () => {
    const random = randomSuffix()
    // Create more prompts than the default limit
    const prompts = []
    const moderatorIds = []
    for (let i = 0; i < 15; i++) {
      const systemUser = await createSystemUser(`limit-mod-${i}-${random}`)
      const moderator = await createPostLLMModerator(user!, systemUser, `limit-mod-${i}-${random}`)
      moderatorIds.push(moderator.id)

      const prompt = await createOpenAIPostLLMModerationPrompt(
        user!,
        'openai',
        'gpt-5.4-nano',
        `Prompt ${i}`,
        moderator.id,
      )
      prompts.push(prompt)
      await updateOpenAIPostLLMModerationPrompt(user!, prompt.id, { active: true })
    }

    // Test with custom limit of 5
    const results = await getOpenAIPostLLMModerationPrompts(user!, { limit: 5 })
    expect(results.length).toBe(5)

    // Test with custom limit of 3
    const results2 = await getOpenAIPostLLMModerationPrompts(user!, { limit: 3 })
    expect(results2.length).toBe(3)
  })

  it('getOpenAIPostLLMModerationPrompts with before_at filters by activated_at when sort=activated', async () => {
    const random = randomSuffix()
    const baseMs = Date.now() - 3000
    const systemUser1 = await createSystemUser(`before-activated-mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(
      user!,
      systemUser1,
      `before-activated-mod-1-${random}`,
    )
    const systemUser2 = await createSystemUser(`before-activated-mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(
      user!,
      systemUser2,
      `before-activated-mod-2-${random}`,
    )
    const systemUser3 = await createSystemUser(`before-activated-mod-3-${random}`)
    const moderator3 = await createPostLLMModerator(
      user!,
      systemUser3,
      `before-activated-mod-3-${random}`,
    )
    // Create prompts and activate them
    const prompt1 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 1',
      moderator1.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user!, prompt1.id, { active: true })
    await setTestModerationPromptActivatedAt(prompt1.id, new Date(baseMs))

    const beforeAt = new Date(baseMs + 500)

    const prompt2 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 2',
      moderator2.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user!, prompt2.id, { active: true })
    await setTestModerationPromptActivatedAt(prompt2.id, new Date(baseMs + 1000))

    const prompt3 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 3',
      moderator3.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user!, prompt3.id, { active: true })
    await setTestModerationPromptActivatedAt(prompt3.id, new Date(baseMs + 2000))

    // Get prompts before beforeAt (should only include prompt1)
    const results = await getOpenAIPostLLMModerationPrompts(user!, {
      before_at: beforeAt,
      sort: 'activated',
    })

    // Should only include prompts activated before beforeAt
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.id === prompt1.id)).toBe(true)
    expect(results.some(r => r.id === prompt2.id)).toBe(false)
    expect(results.some(r => r.id === prompt3.id)).toBe(false)

    // Verify all results have activated_at < beforeAt
    for (const result of results) {
      expect(result.activated_at).toBeInstanceOf(Date)
      expect(result.activated_at!.getTime()).toBeLessThan(beforeAt.getTime())
    }
  })

  it('getOpenAIPostLLMModerationPrompts with before_at filters by created_at when sort=created', async () => {
    const random = randomSuffix()
    const systemUser1 = await createSystemUser(`before-created-mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(
      user!,
      systemUser1,
      `before-created-mod-1-${random}`,
    )
    const systemUser2 = await createSystemUser(`before-created-mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(
      user!,
      systemUser2,
      `before-created-mod-2-${random}`,
    )
    const systemUser3 = await createSystemUser(`before-created-mod-3-${random}`)
    const moderator3 = await createPostLLMModerator(
      user!,
      systemUser3,
      `before-created-mod-3-${random}`,
    )
    // Keep these UUIDv7 timestamps ahead of concurrent backend tests so the
    // default page contains this fixture even in a busy shared test database.
    // `agent_prompts.created_at` is a VIRTUAL GENERATED column derived from
    // `uuid_extract_timestamp(id)`, so a future synthetic id also pushes
    // `created_at` (and `before_at = prompt2.created_at`) into the future,
    // keeping prompt1 ahead of historical/concurrent rows under `ORDER BY id DESC`.
    const baseMs = Date.now() + 60_000

    // Create first prompt
    const createdPrompt1 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 1',
      moderator1.id,
    )
    const prompt1 = await updateAgentPromptIdForTest(createdPrompt1.id, uuidv7({ msecs: baseMs }))

    // Use prompt2's database timestamp as the exclusive boundary.
    const createdPrompt2 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 2',
      moderator2.id,
    )
    const prompt2 = await updateAgentPromptIdForTest(
      createdPrompt2.id,
      uuidv7({ msecs: baseMs + 1000 }),
    )
    const beforeAt = prompt2.created_at
    const createdPrompt3 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 3',
      moderator3.id,
    )
    const prompt3 = await updateAgentPromptIdForTest(
      createdPrompt3.id,
      uuidv7({ msecs: baseMs + 2000 }),
    )
    // Get prompts created before beforeAt (should only include prompt1)
    const results = await getOpenAIPostLLMModerationPrompts(user!, {
      before_at: beforeAt,
      sort: 'created',
    })

    // Should only include prompts created before beforeAt
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.id === prompt1.id)).toBe(true)
    expect(results.some(r => r.id === prompt2.id)).toBe(false)
    expect(results.some(r => r.id === prompt3.id)).toBe(false)

    // Verify all results have created_at < beforeAt
    for (const result of results) {
      expect(result.created_at).toBeInstanceOf(Date)
      expect(result.created_at!.getTime()).toBeLessThan(beforeAt.getTime())
    }
  })

  it('getOpenAIPostLLMModerationPrompts excludes deleted prompts', async () => {
    const random = randomSuffix()
    const systemUser1 = await createSystemUser(`deleted-mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(user!, systemUser1, `deleted-mod-1-${random}`)
    const systemUser2 = await createSystemUser(`deleted-mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(user!, systemUser2, `deleted-mod-2-${random}`)
    // Create and activate prompts
    const prompt1 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 1',
      moderator1.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user!, prompt1.id, { active: true })

    const prompt2 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 2',
      moderator2.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user!, prompt2.id, { active: true })

    // Delete prompt2
    await softDeleteModerationPrompt(prompt2.id)

    // Get prompts - should not include deleted prompt2
    const results = await getOpenAIPostLLMModerationPrompts(user!, { limit: 100 })
    expect(results.some(r => r.id === prompt2.id)).toBe(false)
    expect(results.some(r => r.id === prompt1.id)).toBe(true)
  })

  it('getOpenAIPostLLMModerationPrompts with sort=activated excludes non-activated prompts', async () => {
    const random = randomSuffix()
    const systemUser1 = await createSystemUser(`excludes-mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(user!, systemUser1, `excludes-mod-1-${random}`)
    const systemUser2 = await createSystemUser(`excludes-mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(user!, systemUser2, `excludes-mod-2-${random}`)
    // Create prompts
    const prompt1 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 1',
      moderator1.id,
    )
    const prompt2 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 2',
      moderator2.id,
    )
    // Only activate prompt1
    await updateOpenAIPostLLMModerationPrompt(user!, prompt1.id, { active: true })

    // Default sort=activated should only return activated prompts
    const results = await getOpenAIPostLLMModerationPrompts(user!, { limit: 100 })

    expect(results.some(r => r.id === prompt1.id)).toBe(true)
    expect(results.some(r => r.id === prompt2.id)).toBe(false)

    // All results should have activated_at set
    for (const result of results) {
      expect(result.activated_at).toBeInstanceOf(Date)
    }
  })
})
