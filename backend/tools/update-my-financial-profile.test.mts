import { beforeAll, describe, expect, it } from 'vitest'
import updateMyFinancialProfileTool from './update-my-financial-profile.mts'
import { createTestUser } from '@voucha/test-helpers'
import { getUserFinancialProfile } from '@services/user-financial-profiles'
import type { PrivateUser } from '@services/users/types'

describe('update_my_financial_profile tool — real DB', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('exposes numeric range constraints in the tool schema', () => {
    const { parameters } = updateMyFinancialProfileTool.schema
    if (!parameters) throw new Error('expected tool parameters')

    const properties = parameters.properties as Record<
      string,
      { anyOf?: unknown[]; description?: string }
    >

    expect(properties.credit_score_range.anyOf).toEqual([
      { type: 'null' },
      expect.objectContaining({ type: 'string' }),
    ])
    expect(properties.stated_income_range.anyOf).toEqual([
      { type: 'null' },
      expect.objectContaining({ type: 'object' }),
    ])
    expect(properties.total_credit_limit.anyOf).toEqual([
      { type: 'null' },
      expect.objectContaining({ type: 'object' }),
    ])
    expect(properties.years_of_credit_history.anyOf).toEqual([
      { type: 'null' },
      { type: 'integer', minimum: 0, maximum: 100 },
    ])
    expect(properties.stated_income_range.description).toContain('integer minor units')
    expect(properties.stated_income_range.description).toContain('7500000')
    expect(properties.stated_income_range.description).toContain('"currency":"usd"')
    expect(properties.total_credit_limit.description).toContain('integer minor units')
    expect(properties.total_credit_limit.description).toContain('2500000')
    expect(properties.total_credit_limit.description).toContain('"currency":"usd"')
  })

  it('creates a financial profile when none exists', async () => {
    const freshUser = await createTestUser()
    const execute = updateMyFinancialProfileTool.function(freshUser)

    const result = await execute({ credit_score_range: '670-739' })

    expect(result.success).toBe(true)
    expect(result.profile.credit_score_range).toBe('670-739')
    expect(result.profile.currency).toBe('usd')

    // Verify persisted to DB
    const persisted = await getUserFinancialProfile(freshUser.id)
    expect(persisted?.credit_score_range).toBe('670-739')
  })

  it('updates an existing profile', async () => {
    const execute = updateMyFinancialProfileTool.function(user)

    // Create initial profile
    await execute({ currency: 'usd', credit_score_range: '580-669' })

    // Update it
    const result = await execute({
      credit_score_range: '740-799',
      stated_income_range: {
        minimum: { amount: 7_500_000, currency: 'usd' },
        maximum: { amount: 10_000_000, currency: 'usd' },
      },
      total_credit_limit: { amount: 2_500_000, currency: 'usd' },
      years_of_credit_history: 10,
    })

    expect(result.success).toBe(true)
    expect(result.profile.credit_score_range).toBe('740-799')
    expect(result.profile.stated_income_range).toEqual({
      minimum: { amount: 7_500_000, currency: 'usd' },
      maximum: { amount: 10_000_000, currency: 'usd' },
    })
    expect(result.profile.total_credit_limit).toEqual({
      amount: 2_500_000,
      currency: 'usd',
    })
    expect(result.profile.years_of_credit_history).toBe(10)
  })

  it('allows clearing fields with null', async () => {
    const clearUser = await createTestUser()
    const execute = updateMyFinancialProfileTool.function(clearUser)

    // Set a value first
    await execute({ currency: 'usd', credit_score_range: '670-739' })

    // Clear it
    const result = await execute({ credit_score_range: null })

    expect(result.success).toBe(true)
    expect(result.profile.credit_score_range).toBeNull()
  })

  it('rejects invalid credit_score_range', async () => {
    const execute = updateMyFinancialProfileTool.function(user)

    await expect(execute({ credit_score_range: 'invalid-range' })).rejects.toBeDefined()
  })

  it('rejects invalid stated_income_range', async () => {
    const execute = updateMyFinancialProfileTool.function(user)

    await expect(
      execute({
        stated_income_range: {
          minimum: { amount: 100, currency: 'usd' },
          maximum: { amount: 50, currency: 'usd' },
        },
      }),
    ).rejects.toBeDefined()
  })

  it('returns all profile fields in response', async () => {
    const profileUser = await createTestUser()
    const execute = updateMyFinancialProfileTool.function(profileUser)

    const result = await execute({ currency: 'usd', credit_score_range: '670-739' })

    expect(result.success).toBe(true)
    expect(result.profile).toHaveProperty('credit_score_range')
    expect(result.profile).toHaveProperty('stated_income_range')
    expect(result.profile).toHaveProperty('total_credit_limit')
    expect(result.profile).toHaveProperty('years_of_credit_history')
  })

  it('omitted fields stay as-is on update', async () => {
    const stableUser = await createTestUser()
    const execute = updateMyFinancialProfileTool.function(stableUser)

    // Set initial values
    await execute({
      currency: 'usd',
      credit_score_range: '670-739',
      stated_income_range: {
        minimum: { amount: 7_500_000, currency: 'usd' },
        maximum: { amount: 10_000_000, currency: 'usd' },
      },
    })

    // Update only credit_score_range
    const result = await execute({ credit_score_range: '740-799' })

    expect(result.success).toBe(true)
    // stated_income_range should be preserved
    expect(result.profile.stated_income_range).toEqual({
      minimum: { amount: 7_500_000, currency: 'usd' },
      maximum: { amount: 10_000_000, currency: 'usd' },
    })
    expect(result.profile.credit_score_range).toBe('740-799')
  })
})
