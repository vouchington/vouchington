import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  createTestMembership,
} from '@voucha/test-helpers'
import {
  allocateCommunityAgentPromptSlot,
  deallocateCommunityAgentPromptSlot,
} from './allocate.mts'
import { getCommunityAgentPrompt } from './get.mts'
import { getUsedSlotsForUser } from './slots.mts'
import { getActiveCommunityAgentPrompts } from './get-active-prompts.mts'

describe('prompt slot capacity', () => {
  it.each([
    { plan: 'plus' as const, limit: 3 },
    { plan: 'pro' as const, limit: 10 },
  ])('admits exactly $limit concurrent $plan allocations', async ({ plan, limit }) => {
    const creator = await createTestUser()
    await createTestMembership({ user_id: creator.id, plan })
    const community = await insertTestCommunity({ createdById: creator.id })
    const prompts = await Promise.all(
      Array.from({ length: limit + 1 }, () =>
        insertTestCommunityAgentPrompt({ communityId: community.id, createdById: creator.id }),
      ),
    )

    const outcomes = await Promise.allSettled(
      prompts.map(prompt => allocateCommunityAgentPromptSlot(creator.id, prompt)),
    )
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(limit)
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)
    expect(await getUsedSlotsForUser(creator.id)).toBe(limit)
    const persisted = await Promise.all(prompts.map(prompt => getCommunityAgentPrompt(prompt.id)))
    expect(persisted.filter(prompt => prompt?.is_slot_allocated)).toHaveLength(limit)
  })

  it('retains allocations across a downgrade and reveals them again on upgrade', async () => {
    const creator = await createTestUser()
    const stripe_customer_id = `cus_slot_${creator.id}`
    await createTestMembership({ user_id: creator.id, plan: 'pro', stripe_customer_id })
    const community = await insertTestCommunity({ createdById: creator.id })
    const prompts = await Promise.all(
      Array.from({ length: 5 }, () =>
        insertTestCommunityAgentPrompt({ communityId: community.id, createdById: creator.id }),
      ),
    )
    for (const prompt of prompts.slice(0, 4)) {
      await allocateCommunityAgentPromptSlot(creator.id, prompt)
    }

    await createTestMembership({ user_id: creator.id, plan: 'plus', stripe_customer_id })
    expect((await getActiveCommunityAgentPrompts(community.id)).map(prompt => prompt.id)).toEqual(
      prompts.slice(0, 3).map(prompt => prompt.id),
    )
    await expect(allocateCommunityAgentPromptSlot(creator.id, prompts[4]!)).rejects.toMatchObject({
      status: 422,
    })
    expect(await getUsedSlotsForUser(creator.id)).toBe(4)

    await createTestMembership({ user_id: creator.id, plan: 'pro', stripe_customer_id })
    expect((await getActiveCommunityAgentPrompts(community.id)).map(prompt => prompt.id)).toEqual(
      prompts.slice(0, 4).map(prompt => prompt.id),
    )

    await createTestMembership({ user_id: creator.id, plan: 'plus', stripe_customer_id })
    await deallocateCommunityAgentPromptSlot(
      creator.id,
      (await getCommunityAgentPrompt(prompts[0]!.id))!,
    )
    await expect(allocateCommunityAgentPromptSlot(creator.id, prompts[4]!)).rejects.toMatchObject({
      status: 422,
    })
    await deallocateCommunityAgentPromptSlot(
      creator.id,
      (await getCommunityAgentPrompt(prompts[1]!.id))!,
    )
    await allocateCommunityAgentPromptSlot(creator.id, prompts[4]!)
    expect(await getUsedSlotsForUser(creator.id)).toBe(3)
  })
})
