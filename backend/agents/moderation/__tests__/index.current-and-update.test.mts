import { it, expect, beforeAll, describe } from 'vitest'
import {
  createOpenAIPostLLMModerationPrompt,
  updateOpenAIPostLLMModerationPrompt,
  createPostLLMModerator,
} from '@services/moderation'
import { createTestUser, createSystemUser, getModerationPromptStatus } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('index.current-and-update', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('activate sets activated_at and clears deactivated_at', async () => {
    const random = randomSuffix()
    const systemUser = await createSystemUser(`current-mod-${random}`)
    const moderator = await createPostLLMModerator(user!, systemUser, `current-mod-${random}`)
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Test prompt',
      moderator.id,
    )

    const activated = await updateOpenAIPostLLMModerationPrompt(user!, prompt.id, { active: true })
    expect(activated).toBeDefined()
    expect(activated?.id).toBe(prompt.id)
    expect(activated?.activated_at).toBeInstanceOf(Date)
    expect(activated?.deactivated_at).toBeNull()

    const status = await getModerationPromptStatus(prompt.id)
    expect(status).not.toBeNull()
    expect(status!.activated_at).toBeInstanceOf(Date)
    expect(status!.deactivated_at).toBeNull()
  })

  it('deactivate sets deactivated_at and does not affect other prompts', async () => {
    const random = randomSuffix()
    const systemUser1 = await createSystemUser(`update-mod-1-${random}`)
    const moderator1 = await createPostLLMModerator(user!, systemUser1, `update-mod-1-${random}`)
    const systemUser2 = await createSystemUser(`update-mod-2-${random}`)
    const moderator2 = await createPostLLMModerator(user!, systemUser2, `update-mod-2-${random}`)
    // Create and activate two prompts
    const prompt1 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'First prompt',
      moderator1.id,
    )
    const prompt2 = await createOpenAIPostLLMModerationPrompt(
      user!,
      'openai',
      'gpt-5.4-nano',
      'Second prompt',
      moderator2.id,
    )

    await updateOpenAIPostLLMModerationPrompt(user!, prompt1.id, { active: true })
    await updateOpenAIPostLLMModerationPrompt(user!, prompt2.id, { active: true })

    // Verify both are active
    const status1Before = await getModerationPromptStatus(prompt1.id)
    expect(status1Before!.activated_at).toBeInstanceOf(Date)
    expect(status1Before!.deactivated_at).toBeNull()

    const status2Before = await getModerationPromptStatus(prompt2.id)
    expect(status2Before!.activated_at).toBeInstanceOf(Date)
    expect(status2Before!.deactivated_at).toBeNull()

    // Deactivate prompt2
    const result = await updateOpenAIPostLLMModerationPrompt(user!, prompt2.id, { active: false })
    expect(result).toBeDefined()
    expect(result?.id).toBe(prompt2.id)
    expect(result?.deactivated_at).toBeInstanceOf(Date)

    // Verify prompt1 is still active (not affected by deactivating prompt2)
    const status1After = await getModerationPromptStatus(prompt1.id)
    expect(status1After!.activated_at).toBeInstanceOf(Date)
    expect(status1After!.deactivated_at).toBeNull()

    // Verify prompt2 is deactivated
    const status2After = await getModerationPromptStatus(prompt2.id)
    expect(status2After!.deactivated_at).toBeInstanceOf(Date)
  })
})
