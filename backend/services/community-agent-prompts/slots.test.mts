import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { getUsedSlotsForUser, getSlotLimitForMembership, SLOT_LIMITS_BY_PLAN } from './slots.mts'
import { createCommunityAgentPrompt } from './create.mts'

describe('getUsedSlotsForUser', () => {
  it('returns 0 for users with no slots allocated', async () => {
    const user = await createTestUser()
    const usedSlots = await getUsedSlotsForUser(user.id)
    expect(usedSlots).toBe(0)
  })

  it('returns count of allocated slots (0 when newly created prompts are not allocated)', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })

    await Promise.all([
      createCommunityAgentPrompt(user.id, community.id, { prompt: 'Test prompt 1' }),
      createCommunityAgentPrompt(user.id, community.id, { prompt: 'Test prompt 2' }),
    ])

    // Newly created prompts have slot_allocated = false by default
    const usedSlots = await getUsedSlotsForUser(user.id)
    expect(usedSlots).toBe(0)
  })

  it('counts allocated slots correctly', async () => {
    const user = await createTestUser()
    const [community1, community2] = await Promise.all([
      insertTestCommunity({ createdById: user.id }),
      insertTestCommunity({ createdById: user.id }),
    ])

    await Promise.all([
      insertTestCommunityAgentPrompt({
        communityId: community1.id,
        createdById: user.id,
        slotAllocated: true,
      }),
      insertTestCommunityAgentPrompt({
        communityId: community2.id,
        createdById: user.id,
        slotAllocated: true,
      }),
      // Unallocated prompt — should not count
      insertTestCommunityAgentPrompt({ communityId: community1.id, createdById: user.id }),
    ])

    const usedSlots = await getUsedSlotsForUser(user.id)
    expect(usedSlots).toBe(2)
  })
})

describe('getSlotLimitForMembership', () => {
  it('returns correct limit for plus plan', () => {
    expect(getSlotLimitForMembership('plus')).toBe(3)
  })

  it('returns correct limit for pro plan', () => {
    expect(getSlotLimitForMembership('pro')).toBe(10)
  })

  it('returns 0 for null plan', () => {
    expect(getSlotLimitForMembership(null)).toBe(0)
  })

  it('returns 0 for undefined plan', () => {
    expect(getSlotLimitForMembership(undefined)).toBe(0)
  })
})

describe('SLOT_LIMITS_BY_PLAN', () => {
  it('has plus set to 3', () => {
    expect(SLOT_LIMITS_BY_PLAN.plus).toBe(3)
  })

  it('has pro set to 10', () => {
    expect(SLOT_LIMITS_BY_PLAN.pro).toBe(10)
  })
})
