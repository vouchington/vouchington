import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  assignTestRepresentativeIndividual,
  createTestIndividual,
} from '@voucha/test-helpers/entities/individuals'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { waitForObservedTransactionWork } from '@voucha/test-helpers/injected-transaction-queries'
import { getUserFinancialProfile } from './get.mts'
import type { UserFinancialProfile } from './types.mts'
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

  it('rejects a monetary edit validated before the existing profile changed currency', async () => {
    const user = await createTestUser()
    const individual = await createTestIndividual()
    await assignTestRepresentativeIndividual(user.id, individual.id)
    await upsertUserFinancialProfile(user.id, {
      stated_income_range: { minimum: { amount: 3_000_000, currency: 'usd' }, maximum: null },
      total_credit_limit: { amount: 500_000, currency: 'usd' },
    })
    const jpyIncome = {
      minimum: { amount: 5_000_000, currency: 'jpy' as const },
      maximum: { amount: 7_500_000, currency: 'jpy' as const },
    }
    const expectedProfile = {
      currency: 'jpy',
      stated_income_range: jpyIncome,
      total_credit_limit: null,
    } as const

    let currencyChange: Promise<[PromiseSettledResult<UserFinancialProfile>]> | undefined
    let changedProfile: UserFinancialProfile | undefined
    const restore = beforePostgresTransactionQueryForTest(
      'INSERT INTO individual_financial_profiles',
      values => values[0] === individual.id,
      async () => {
        const pending = Promise.allSettled([upsertUserFinancialProfile(user.id, expectedProfile)])
        currencyChange = pending
        const [change] = await waitForObservedTransactionWork(
          pending,
          'The competing profile currency change',
        )
        if (change.status === 'rejected') throw change.reason
        changedProfile = change.value
      },
    )
    try {
      await expect(
        upsertUserFinancialProfile(user.id, {
          total_credit_limit: { amount: 900_000, currency: 'usd' },
        }),
      ).rejects.toMatchObject({ status: 409 })
      expect(changedProfile).toMatchObject(expectedProfile)
      expect(await getUserFinancialProfile(user.id)).toEqual(changedProfile)
    } finally {
      await currencyChange
      restore()
    }
  })

  it('returns 404 when the profile owner does not exist', async () => {
    await expect(
      upsertUserFinancialProfile(randomUUID(), { credit_score_range: '670-739' }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
