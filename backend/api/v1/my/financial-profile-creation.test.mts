import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'

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
})
