import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  assignTestRepresentativeIndividual,
  createTestIndividual,
} from '@voucha/test-helpers/entities/individuals'
import { interceptPostgresTransactionQueriesForTest } from '@voucha/test-helpers/injected-transaction-queries'
import { getUserFinancialProfile } from './get.mts'
import { upsertUserFinancialProfile } from './upsert.mts'

describe('upsertUserFinancialProfile concurrency', () => {
  it('maps an out-of-range monetary value to 422 without storing a partial profile', async () => {
    const user = await createTestUser()

    await expect(
      upsertUserFinancialProfile(user.id, {
        total_credit_limit: { amount: -1, currency: 'usd' },
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'financial profile money is outside the supported range',
    })
    expect(await getUserFinancialProfile(user.id)).toBeNull()

    await expect(
      upsertUserFinancialProfile(user.id, {
        total_credit_limit: { amount: 100, currency: 'usd' },
      }),
    ).resolves.toMatchObject({ total_credit_limit: { amount: 100, currency: 'usd' } })
  })

  it('serializes competing first creates without mixing amount state across currencies', async () => {
    const user = await createTestUser()
    const jpyIncome = {
      minimum: { amount: 5_000_000, currency: 'jpy' as const },
      maximum: { amount: 7_500_000, currency: 'jpy' as const },
    }
    const usdCreditLimit = { amount: 900_000, currency: 'usd' as const }

    const individual = await createTestIndividual()
    await assignTestRepresentativeIndividual(user.id, individual.id)
    const barrier = Promise.withResolvers<void>()
    let writes = 0
    const restore = interceptPostgresTransactionQueriesForTest(
      (statement, values) =>
        statement.includes('INSERT INTO individual_financial_profiles') &&
        values[0] === individual.id,
      () => {
        writes++
        if (writes === 2) barrier.resolve()
        return barrier.promise
      },
    )
    try {
      const outcomes = await Promise.allSettled([
        upsertUserFinancialProfile(user.id, { stated_income_range: jpyIncome }).finally(
          barrier.resolve,
        ),
        upsertUserFinancialProfile(user.id, { total_credit_limit: usdCreditLimit }).finally(
          barrier.resolve,
        ),
      ])

      expect(writes).toBe(2)
      const winners = outcomes.filter(outcome => outcome.status === 'fulfilled')
      const conflicts = outcomes.filter(outcome => outcome.status === 'rejected')
      expect(winners).toHaveLength(1)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]?.reason).toMatchObject({ status: 409 })
      const profile = await getUserFinancialProfile(user.id)
      expect(profile).toEqual(winners[0]?.value)
      expect(profile).toMatchObject(
        outcomes[0]?.status === 'fulfilled'
          ? { currency: 'jpy', stated_income_range: jpyIncome, total_credit_limit: null }
          : { currency: 'usd', stated_income_range: null, total_credit_limit: usdCreditLimit },
      )
    } finally {
      barrier.resolve()
      restore()
    }
  })

  it('returns 404 when the profile owner does not exist', async () => {
    await expect(
      upsertUserFinancialProfile(randomUUID(), { credit_score_range: '670-739' }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
