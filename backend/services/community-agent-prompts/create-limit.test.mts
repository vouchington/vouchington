import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { communityAgentPromptsConfig } from './config.mts'
import { createCommunityAgentPrompt } from './create.mts'
import { deleteCommunityAgentPrompt } from './delete.mts'
import { searchCommunityAgentPrompts } from './get.mts'

describe('community agent prompt admission', () => {
  beforeAll(async () => {
    await communityAgentPromptsConfig.waitForInitialization()
    await communityAgentPromptsConfig.close()
  })

  it('counts drafts and ignores deleted prompts and other creator/community pairs', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityAgentPromptsConfig, {
        prompts_per_user_per_community: 2,
      }),
    )
    const user = await createTestUser({ administrator: true })
    const other = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const elsewhere = await insertTestCommunity({ createdById: user.id })
    const deleted = await createCommunityAgentPrompt(user.id, community.id, {
      prompt: 'Deleted draft',
    })
    await deleteCommunityAgentPrompt(user, deleted)
    await createCommunityAgentPrompt(other.id, community.id, { prompt: 'Other creator draft' })
    await createCommunityAgentPrompt(user.id, elsewhere.id, { prompt: 'Other community draft' })
    const first = await createCommunityAgentPrompt(user.id, community.id, { prompt: 'First draft' })
    const second = await createCommunityAgentPrompt(user.id, community.id, {
      prompt: 'Second draft',
    })
    expect(first.is_slot_allocated).toBe(false)
    expect(second.is_slot_allocated).toBe(false)
    await expect(
      createCommunityAgentPrompt(user.id, community.id, { prompt: 'Over cap' }),
    ).rejects.toMatchObject({ status: 409, code: 'COMMUNITY_AGENT_PROMPT_LIMIT_REACHED' })
    const page = await searchCommunityAgentPrompts(community.id)
    expect(
      page.results.filter(prompt => prompt.created_by_id === user.id).map(prompt => prompt.id),
    ).toEqual([second.id, first.id])
  })

  it('rejects the next create after sequentially reaching the cap', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityAgentPromptsConfig, {
        prompts_per_user_per_community: 1,
      }),
    )
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const created = await createCommunityAgentPrompt(user.id, community.id, {
      prompt: 'First draft',
    })
    await expect(
      createCommunityAgentPrompt(user.id, community.id, { prompt: 'Over cap' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'COMMUNITY_AGENT_PROMPT_LIMIT_REACHED',
    })
    expect(
      (await searchCommunityAgentPrompts(community.id)).results.map(prompt => prompt.id),
    ).toEqual([created.id])
  })
})
