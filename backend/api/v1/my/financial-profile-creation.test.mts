import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  assignTestRepresentativeIndividual,
  createTestIndividual,
} from '@voucha/test-helpers/entities/individuals'
import {
  interceptPostgresTransactionQueriesForTest,
  waitForObservedTransactionWork,
} from '@voucha/test-helpers/injected-transaction-queries'

describe('PUT /api/v1/my/financial-profile first creation', () => {
  it('accepts a partial non-money update and defaults the profile currency to usd', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .put('/api/v1/my/financial-profile')
      .send({ credit_score_range: '670-739' })
      .expect(200)

    expect(response.body.financial_profile).toMatchObject({
      credit_score_range: '670-739',
      currency: 'usd',
      stated_income_range: null,
      total_credit_limit: null,
    })
  })

  it('derives the first profile currency from provided money', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .put('/api/v1/my/financial-profile')
      .send({ total_credit_limit: { amount: 500_000, currency: 'jpy' } })
      .expect(200)

    expect(response.body.financial_profile).toMatchObject({
      currency: 'jpy',
      total_credit_limit: { amount: 500_000, currency: 'jpy' },
    })
  })

  it('rejects inconsistent money currencies without creating a profile', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        stated_income_range: {
          minimum: { amount: 5_000_000, currency: 'jpy' },
          maximum: null,
        },
        total_credit_limit: { amount: 500_000, currency: 'usd' },
      })
      .expect(422)

    const response = await request.get('/api/v1/my/financial-profile').expect(200)
    expect(response.body.financial_profile).toBeNull()
  })

  it('returns a conflict when two first writes derive different currencies', async () => {
    const user = await createTestUser()
    const individual = await createTestIndividual()
    await assignTestRepresentativeIndividual(user.id, individual.id)
    const first = createRequest()
    const second = createRequest()
    await Promise.all([first.authenticateAs(user), second.authenticateAs(user)])

    const barrier = Promise.withResolvers<void>()
    let writes = 0
    const restore = interceptPostgresTransactionQueriesForTest(
      (statement, values) =>
        statement.includes('INSERT INTO individual_financial_profiles') &&
        values[0] === individual.id,
      () => {
        writes++
        if (writes === 2) barrier.resolve()
        return waitForObservedTransactionWork(
          barrier.promise,
          'Both first profile writes reaching the upsert',
        )
      },
    )
    try {
      const [credit, income] = await Promise.all([
        Promise.resolve(
          first
            .put('/api/v1/my/financial-profile')
            .send({ total_credit_limit: { amount: 500_000, currency: 'jpy' } }),
        ).finally(barrier.resolve),
        Promise.resolve(
          second.put('/api/v1/my/financial-profile').send({
            stated_income_range: { minimum: { amount: 800_000, currency: 'usd' }, maximum: null },
          }),
        ).finally(barrier.resolve),
      ])

      expect(writes).toBe(2)
      expect([credit.status, income.status].toSorted((a, b) => a - b)).toEqual([200, 409])
      const stored = await first.get('/api/v1/my/financial-profile').expect(200)
      expect(stored.body.financial_profile).toEqual(
        (credit.status === 200 ? credit : income).body.financial_profile,
      )
    } finally {
      barrier.resolve()
      restore()
    }
  })
})
