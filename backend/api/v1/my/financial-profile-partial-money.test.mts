import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('PUT /api/v1/my/financial-profile partial money updates', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('preserves an omitted monetary field during a same-currency update', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        stated_income_range: {
          minimum: { amount: 5_000_000, currency: 'usd' },
          maximum: { amount: 7_500_000, currency: 'usd' },
        },
        total_credit_limit: { amount: 1_000_000, currency: 'usd' },
      })
      .expect(200)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        stated_income_range: {
          minimum: { amount: 6_000_000, currency: 'usd' },
          maximum: null,
        },
      })
      .expect(200)

    const getResponse = await request.get('/api/v1/my/financial-profile').expect(200)
    expect(getResponse.body.financial_profile.stated_income_range).toEqual({
      minimum: { amount: 6_000_000, currency: 'usd' },
      maximum: null,
    })
    expect(getResponse.body.financial_profile.total_credit_limit).toEqual({
      amount: 1_000_000,
      currency: 'usd',
    })
  })
})
