import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getUserFinancialProfile } from './get.mts'
import { upsertUserFinancialProfile } from './upsert.mts'

describe('upsertUserFinancialProfile concurrency', () => {
  it('serializes competing first creates without mixing amount state across currencies', async () => {
    const user = await createTestUser()
    const jpyIncome = {
      minimum: { amount: 5_000_000, currency: 'jpy' as const },
      maximum: { amount: 7_500_000, currency: 'jpy' as const },
    }
    const usdCreditLimit = { amount: 900_000, currency: 'usd' as const }

    const outcomes = await Promise.allSettled([
      upsertUserFinancialProfile(user.id, { stated_income_range: jpyIncome }),
      upsertUserFinancialProfile(user.id, { total_credit_limit: usdCreditLimit }),
    ])

    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({
      reason: { status: 422 },
    })

    const profile = await getUserFinancialProfile(user.id)
    const validFinalStates = [
      {
        currency: 'jpy',
        stated_income_range: jpyIncome,
        total_credit_limit: null,
      },
      {
        currency: 'usd',
        stated_income_range: null,
        total_credit_limit: usdCreditLimit,
      },
    ]
    expect(validFinalStates).toContainEqual({
      currency: profile?.currency,
      stated_income_range: profile?.stated_income_range,
      total_credit_limit: profile?.total_credit_limit,
    })
  })

  it('returns 404 when the profile owner does not exist', async () => {
    await expect(
      upsertUserFinancialProfile(randomUUID(), { credit_score_range: '670-739' }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
