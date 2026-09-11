import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/financial-profile', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/financial-profile').expect(401)
  })

  it('returns null financial_profile when none exists', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/financial-profile').expect(200)
    expect(response.body.financial_profile).toBeNull()
  })
})

describe('PUT /api/v1/my/financial-profile', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .put('/api/v1/my/financial-profile')
      .send({ credit_score_range: '670-739' })
      .expect(401)
  })

  it('upserts financial profile with all fields including new profile fields', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .put('/api/v1/my/financial-profile')
      .send({
        credit_score_range: '670-739',
        currency: 'usd',
        stated_income_range: {
          minimum: { amount: 7_500_000, currency: 'usd' },
          maximum: { amount: 10_000_000, currency: 'usd' },
        },
        total_credit_limit: { amount: 2_500_000, currency: 'usd' },
        years_of_credit_history: 10,
        hard_inquiries_12m: 3,
        cards_opened_24m: 2,
      })
      .expect(200)

    expect(response.body.financial_profile.credit_score_range).toBe('670-739')
    expect(response.body.financial_profile.stated_income_range).toEqual({
      minimum: { amount: 7_500_000, currency: 'usd' },
      maximum: { amount: 10_000_000, currency: 'usd' },
    })
    expect(response.body.financial_profile.total_credit_limit).toEqual({
      amount: 2_500_000,
      currency: 'usd',
    })
    expect(response.body.financial_profile.years_of_credit_history).toBe(10)
    expect(response.body.financial_profile.hard_inquiries_12m).toBe(3)
    expect(response.body.financial_profile.cards_opened_24m).toBe(2)
  })

  it('hard_inquiries_12m and cards_opened_24m round-trip via GET', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({ hard_inquiries_12m: 5, cards_opened_24m: 7 })
      .expect(200)

    const getResponse = await request.get('/api/v1/my/financial-profile').expect(200)
    expect(getResponse.body.financial_profile.hard_inquiries_12m).toBe(5)
    expect(getResponse.body.financial_profile.cards_opened_24m).toBe(7)
  })

  it('updates existing profile on second call', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({ credit_score_range: '740-799' })
      .expect(200)

    const updated = await request
      .put('/api/v1/my/financial-profile')
      .send({ credit_score_range: '800-850' })
      .expect(200)

    expect(updated.body.financial_profile.credit_score_range).toBe('800-850')
  })

  it('returns the updated profile via GET after PUT', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        credit_score_range: '580-669',
        stated_income_range: {
          minimum: { amount: 5_000_000, currency: 'usd' },
          maximum: { amount: 7_500_000, currency: 'usd' },
        },
      })
      .expect(200)

    const getResponse = await request.get('/api/v1/my/financial-profile').expect(200)
    expect(getResponse.body.financial_profile.credit_score_range).toBe('580-669')
    expect(getResponse.body.financial_profile.stated_income_range).toEqual({
      minimum: { amount: 5_000_000, currency: 'usd' },
      maximum: { amount: 7_500_000, currency: 'usd' },
    })
  })

  it('returns 422 for invalid credit_score_range', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({ credit_score_range: '999-9999' })
      .expect(422)
  })

  it.each([null, 'bhd', 'USD'])('returns 422 for invalid currency %j', async currency => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put('/api/v1/my/financial-profile').send({ currency }).expect(422)
  })

  it('returns 422 for invalid stated_income_range', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        stated_income_range: {
          minimum: { amount: 100, currency: 'usd' },
          maximum: { amount: 50, currency: 'usd' },
        },
      })
      .expect(422)
  })

  it('returns 422 for negative total_credit_limit', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({ total_credit_limit: { amount: -1, currency: 'usd' } })
      .expect(422)
  })

  it('rejects mismatched currencies without partially changing the profile currency', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .put('/api/v1/my/financial-profile')
      .send({ total_credit_limit: { amount: 500_000, currency: 'usd' } })
      .expect(200)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        currency: 'jpy',
        stated_income_range: {
          minimum: { amount: 1_000_000, currency: 'jpy' },
          maximum: null,
        },
        total_credit_limit: { amount: 500_000, currency: 'usd' },
      })
      .expect(422)

    const response = await request.get('/api/v1/my/financial-profile').expect(200)
    expect(response.body.financial_profile.currency).toBe('usd')
  })

  it('requires every monetary field to be replaced when changing profile currency', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        currency: 'usd',
        stated_income_range: {
          minimum: { amount: 1_000_000, currency: 'usd' },
          maximum: { amount: 2_000_000, currency: 'usd' },
        },
        total_credit_limit: { amount: 500_000, currency: 'usd' },
      })
      .expect(200)

    await request
      .put('/api/v1/my/financial-profile')
      .send({
        currency: 'jpy',
        stated_income_range: {
          minimum: { amount: 1_000_000, currency: 'jpy' },
          maximum: null,
        },
      })
      .expect(422)

    const response = await request.get('/api/v1/my/financial-profile').expect(200)
    expect(response.body.financial_profile.currency).toBe('usd')
  })

  it('returns 422 for negative hard_inquiries_12m', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.put('/api/v1/my/financial-profile').send({ hard_inquiries_12m: -1 }).expect(422)
  })

  it('returns 422 for out-of-range cards_opened_24m', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.put('/api/v1/my/financial-profile').send({ cards_opened_24m: 101 }).expect(422)
  })

  it('allows null fields to clear values', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    // Set a value first
    await request
      .put('/api/v1/my/financial-profile')
      .send({ credit_score_range: '670-739' })
      .expect(200)

    // Clear it
    const response = await request
      .put('/api/v1/my/financial-profile')
      .send({ credit_score_range: null })
      .expect(200)

    expect(response.body.financial_profile.credit_score_range).toBeNull()
  })

  it('returns 415 for non-JSON content type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .put('/api/v1/my/financial-profile')
      .set('Content-Type', 'text/plain')
      .send('credit_score_range=670-739')
      .expect(415)
  })
})
