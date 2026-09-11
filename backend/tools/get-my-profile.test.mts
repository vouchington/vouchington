import { beforeAll, describe, expect, it } from 'vitest'
import getMyProfileTool from './get-my-profile.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestCard } from '@voucha/test-helpers/entities/cards'
import { insertTestRewardsProgram } from '@voucha/test-helpers/entities/rewards-programs'
import { insertTestRewardsProgramStatus } from '@voucha/test-helpers/entities/rewards-program-statuses'
import { upsertUserFinancialProfile } from '@services/user-financial-profiles'
import {
  createIndividualCard,
  createIndividualRewardsProgramPointValuation,
  createIndividualRewardsProgramStatus,
} from '@services/individuals-households'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('get_my_profile tool — real DB', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('accepts card pagination arguments and returns cards_page_info', async () => {
    const paginationUser = await createTestUser()
    for (let index = 0; index < 2; index += 1) {
      const topicId = await insertTestCard({ createdById: paginationUser.id })
      await createIndividualCard(paginationUser, paginationUser, topicId)
    }
    const execute = getMyProfileTool.function(paginationUser)

    const first = await execute({ cards_limit: 1 })
    expect(first.cards).toHaveLength(1)
    expect(first.cards_page_info.has_next_page).toBe(true)
    const second = await execute({
      cards_limit: 1,
      cards_after: first.cards_page_info.end_cursor!,
    })
    expect(second.cards).toHaveLength(1)
  })

  it('paginates point valuations independently from cards', async () => {
    const paginationUser = await createTestUser()
    for (let index = 0; index < 2; index += 1) {
      const topicId = await insertTestRewardsProgram({ createdById: paginationUser.id })
      await createIndividualRewardsProgramPointValuation(paginationUser, paginationUser, topicId, {
        value_per_point: { amount: (index + 1) * 10_000, currency: 'usd', scale: 6 },
      })
    }
    const execute = getMyProfileTool.function(paginationUser)

    const first = await execute({ point_valuations_limit: 1 })
    expect(first.point_valuations).toHaveLength(1)
    expect(first.point_valuations_page_info.has_next_page).toBe(true)
    const second = await execute({
      point_valuations_limit: 1,
      point_valuations_after: first.point_valuations_page_info.end_cursor!,
    })
    expect(second.point_valuations).toHaveLength(1)
    expect(second.point_valuations[0]?.id).not.toBe(first.point_valuations[0]?.id)
  })

  it('paginates rewards program statuses independently from cards and point valuations', async () => {
    const paginationUser = await createTestUser()
    for (let index = 0; index < 2; index += 1) {
      const topicId = await insertTestRewardsProgramStatus({ createdById: paginationUser.id })
      await createIndividualRewardsProgramStatus(paginationUser, paginationUser, topicId)
    }
    const execute = getMyProfileTool.function(paginationUser)
    const first = await execute({ rewards_program_statuses_limit: 1 })
    expect(first.rewards_program_statuses).toHaveLength(1)
    expect(first.rewards_program_statuses_page_info.has_next_page).toBe(true)
    const second = await execute({
      rewards_program_statuses_limit: 1,
      rewards_program_statuses_after: first.rewards_program_statuses_page_info.end_cursor!,
    })
    expect(second.rewards_program_statuses[0]?.id).not.toBe(first.rewards_program_statuses[0]?.id)
  })

  it('returns success:true with all profile sections', async () => {
    const execute = getMyProfileTool.function(user)
    const result = await execute({})

    expect(result.success).toBe(true)
    expect(result).toHaveProperty('cards')
    expect(result).toHaveProperty('cards_page_info')
    expect(result).toHaveProperty('point_valuations')
    expect(result).toHaveProperty('point_valuations_page_info')
    expect(result).toHaveProperty('rewards_program_statuses')
    expect(result).toHaveProperty('rewards_program_statuses_page_info')
    expect(result).toHaveProperty('financial_profile')
    expect(Array.isArray(result.cards)).toBe(true)
    expect(Array.isArray(result.point_valuations)).toBe(true)
    expect(Array.isArray(result.rewards_program_statuses)).toBe(true)
  })

  it('returns null financial_profile for user with no profile', async () => {
    const freshUser = await createTestUser()
    const execute = getMyProfileTool.function(freshUser)
    const result = await execute({})

    expect(result.success).toBe(true)
    expect(result.financial_profile).toBeNull()
  })

  it('includes financial_profile when user has one', async () => {
    const profileUser = await createTestUser()
    await upsertUserFinancialProfile(profileUser.id, {
      currency: 'usd',
      credit_score_range: '670-739',
      stated_income_range: {
        minimum: { amount: 7_500_000, currency: 'usd' },
        maximum: { amount: 10_000_000, currency: 'usd' },
      },
    })

    const execute = getMyProfileTool.function(profileUser)
    const result = await execute({})

    expect(result.success).toBe(true)
    expect(result.financial_profile).not.toBeNull()
    const profile = result.financial_profile as { credit_score_range: string }
    expect(profile.credit_score_range).toBe('670-739')
  })

  it('includes cards when user has added cards to wallet', async () => {
    const cardUser = await createTestUser()
    const cardId = await insertTestCard({ createdById: cardUser.id })

    // Add card to user's wallet via the same service call POST /api/v1/my/cards makes.
    // Calling the service directly (instead of createRequest()) avoids @voucha/tools
    // depending on @voucha/api, which itself depends on @voucha/tools.
    await createIndividualCard(cardUser, cardUser, cardId)

    const execute = getMyProfileTool.function(cardUser)
    const result = await execute({})

    expect(result.success).toBe(true)
    expect(Array.isArray(result.cards)).toBe(true)
    expect(result.cards.length).toBeGreaterThanOrEqual(1)
  })

  it('hydrates BasicUser callers before loading private profile data', async () => {
    const profileUser = await createTestUser()
    const basicUser: BasicUser = { __entity_type: 'user', id: profileUser.id, roles: [] }
    const execute = getMyProfileTool.function(basicUser)

    const result = await execute({})

    expect(result.success).toBe(true)
    expect(Array.isArray(result.cards)).toBe(true)
  })

  it('rejects unknown current users', async () => {
    const basicUser: BasicUser = { __entity_type: 'user', id: randomUUID(), roles: [] }
    const execute = getMyProfileTool.function(basicUser)

    await expect(execute({})).rejects.toMatchObject({ status: 401 })
  })
})
