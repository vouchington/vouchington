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
  createSystemUser,
  setTestModerationPromptActivatedAt,
  updateAgentPromptIdForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('index.list sort', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('getOpenAIPostLLMModerationPrompts returns prompts sorted by activated_at DESC by default', async () => {
    const random = randomSuffix()
    const baseMs = Date.now() - 3000
    const systemUser1 = await createSystemUser(`sorted-mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(user!, systemUser1, `sorted-mod-1-${random}`)
    const systemUser2 = await createSystemUser(`sorted-mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(user!, systemUser2, `sorted-mod-2-${random}`)
    const systemUser3 = await createSystemUser(`sorted-mod-3-${random}`)
    const moderator3 = await createPostLLMModerator(user!, systemUser3, `sorted-mod-3-${random}`)
    // Create multiple prompts
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
    const prompt3 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 3',
      moderator3.id,
    )
    // Explicit fixture times make ordering deterministic without leaving future-dated test rows.
    await updateOpenAIPostLLMModerationPrompt(user!, prompt1.id, { active: true })
    await updateOpenAIPostLLMModerationPrompt(user!, prompt2.id, { active: true })
    await updateOpenAIPostLLMModerationPrompt(user!, prompt3.id, { active: true })
    await setTestModerationPromptActivatedAt(prompt1.id, new Date(baseMs))
    await setTestModerationPromptActivatedAt(prompt2.id, new Date(baseMs + 1000))
    await setTestModerationPromptActivatedAt(prompt3.id, new Date(baseMs + 2000))

    // Default behavior: sort by activated_at DESC, only returns activated prompts
    // Use high limit to ensure our prompts appear in a dirty database
    const results = await getOpenAIPostLLMModerationPrompts(user!, { limit: 100 })

    expect(results.length).toBeGreaterThanOrEqual(3)
    // Results should be sorted by activated_at DESC (most recent first)
    // Find our prompts in the results
    const prompt1Index = results.findIndex(r => r.id === prompt1.id)
    const prompt2Index = results.findIndex(r => r.id === prompt2.id)
    const prompt3Index = results.findIndex(r => r.id === prompt3.id)

    expect(prompt1Index).toBeGreaterThanOrEqual(0)
    expect(prompt2Index).toBeGreaterThanOrEqual(0)
    expect(prompt3Index).toBeGreaterThanOrEqual(0)

    // Verify order: prompt3 (most recent) should come before prompt2, which should come before prompt1
    expect(prompt3Index).toBeLessThan(prompt2Index)
    expect(prompt2Index).toBeLessThan(prompt1Index)

    // All results should have activated_at set
    for (const result of results) {
      expect(result.activated_at).toBeInstanceOf(Date)
    }
  })

  it('getOpenAIPostLLMModerationPrompts with sort=created returns all prompts sorted by created_at DESC', async () => {
    const random = randomSuffix()
    const baseMs = Date.now() - 2000
    const systemUser1 = await createSystemUser(`created-mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(user!, systemUser1, `created-mod-1-${random}`)
    const systemUser2 = await createSystemUser(`created-mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(user!, systemUser2, `created-mod-2-${random}`)
    const systemUser3 = await createSystemUser(`created-mod-3-${random}`)
    const moderator3 = await createPostLLMModerator(user!, systemUser3, `created-mod-3-${random}`)
    // UUIDv7-derived created_at is explicit and ordered without future-dating persistent rows.
    const createdPrompt1 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Prompt 1',
      moderator1.id,
    )
    const prompt1 = await updateAgentPromptIdForTest(createdPrompt1.id, uuidv7({ msecs: baseMs }))
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
    // Activate only prompt1 to verify sort=created returns all prompts, not just activated ones
    await updateOpenAIPostLLMModerationPrompt(user!, prompt1.id, { active: true })

    // sort=created should return all prompts (activated and non-activated), sorted by created_at DESC
    const results = await getOpenAIPostLLMModerationPrompts(user!, { sort: 'created', limit: 100 })

    expect(results.length).toBeGreaterThanOrEqual(3)
    // Results should be sorted by created_at DESC (most recent first)
    // Find our prompts in the results
    const prompt1Index = results.findIndex(r => r.id === prompt1.id)
    const prompt2Index = results.findIndex(r => r.id === prompt2.id)
    const prompt3Index = results.findIndex(r => r.id === prompt3.id)

    expect(prompt1Index).toBeGreaterThanOrEqual(0)
    expect(prompt2Index).toBeGreaterThanOrEqual(0)
    expect(prompt3Index).toBeGreaterThanOrEqual(0)

    // Verify order: prompt3 (most recent) should come before prompt2, which should come before prompt1
    expect(prompt3Index).toBeLessThan(prompt2Index)
    expect(prompt2Index).toBeLessThan(prompt1Index)

    // Should include both activated and non-activated prompts
    const hasActivated = results.some(r => r.activated_at !== null)
    const hasNonActivated = results.some(r => r.activated_at === null)
    expect(hasActivated).toBe(true)
    expect(hasNonActivated).toBe(true)
  })
})
