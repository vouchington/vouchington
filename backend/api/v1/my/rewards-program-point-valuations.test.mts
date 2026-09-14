import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestRewardsProgram } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/rewards-program-point-valuations', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/rewards-program-point-valuations').expect(401)
  })

  it('returns empty list for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/rewards-program-point-valuations').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('returns cursor-paginated valuations without duplicates', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const programIds = await Promise.all([
      insertTestRewardsProgram({ createdById: user.id }),
      insertTestRewardsProgram({ createdById: user.id }),
    ])
    for (const rewardsProgramId of programIds) {
      await request
        .post('/api/v1/my/rewards-program-point-valuations')
        .send({
          rewards_program_id: rewardsProgramId,
          value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
        })
        .expect(201)
    }

    const first = await request
      .get('/api/v1/my/rewards-program-point-valuations?limit=1')
      .expect(200)
    expect(first.body.results).toHaveLength(1)
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(first.body.page_info.end_cursor).toEqual(expect.any(String))

    const second = await request
      .get(
        `/api/v1/my/rewards-program-point-valuations?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(second.body.results).toHaveLength(1)
    expect(second.body.results[0].id).not.toBe(first.body.results[0].id)
  })

  it('rejects malformed cursors', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/my/rewards-program-point-valuations?after=not-a-cursor').expect(400)
  })

  it('rejects a cursor issued for another individual', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
      })
      .expect(201)
    const first = await request
      .get('/api/v1/my/rewards-program-point-valuations?limit=1')
      .expect(200)
    expect(first.body.page_info.end_cursor).toEqual(expect.any(String))

    const otherUser = await createTestUser()
    const otherRequest = createRequest()
    await otherRequest.authenticateAs(otherUser)
    await otherRequest
      .get(
        `/api/v1/my/rewards-program-point-valuations?after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })
})

describe('POST /api/v1/my/rewards-program-point-valuations', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/my/rewards-program-point-valuations').send({}).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .set('Content-Type', 'text/plain')
      .send('value_per_point=1')
      .expect(415)
  })

  it('returns 400 when rewards_program_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({ value_per_point: { amount: 10_000, currency: 'usd', scale: 6 } })
      .expect(400)
  })

  it('returns 400 when value_per_point is missing', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({ rewards_program_id: programId })
      .expect(400)
  })

  it('returns 422 for a negative point value', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: -1, currency: 'usd', scale: 6 },
      })
      .expect(422)
  })

  it('returns 422 when note is present but not a string or null', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
        note: 123,
      })
      .expect(422)

    expect(response.body.message).toBe('note must be a string or null')
  })

  it('creates a point valuation successfully', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
      })
      .expect(201)
    expect(response.body.point_valuation.rewards_program_id).toBe(programId)
  })

  it('accepts zero as integer scale-six money', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: 0, currency: 'jpy', scale: 6 },
      })
      .expect(201)

    expect(response.body.point_valuation.value_per_point).toEqual({
      amount: 0,
      currency: 'jpy',
      scale: 6,
    })
  })
})

describe('PATCH /api/v1/my/rewards-program-point-valuations/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.patch('/api/v1/my/rewards-program-point-valuations/some-id').send({}).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .patch('/api/v1/my/rewards-program-point-valuations/some-id')
      .set('Content-Type', 'text/plain')
      .send('value_per_point=1')
      .expect(415)
  })

  it('returns 422 for a negative point value', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
      })
      .expect(201)
    await request
      .patch(`/api/v1/my/rewards-program-point-valuations/${created.body.point_valuation.id}`)
      .send({ value_per_point: { amount: -5, currency: 'usd', scale: 6 } })
      .expect(422)
  })

  it('patches a point valuation successfully', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
      })
      .expect(201)
    const response = await request
      .patch(`/api/v1/my/rewards-program-point-valuations/${created.body.point_valuation.id}`)
      .send({
        value_per_point: { amount: 25_000, currency: 'eur', scale: 6 },
        note: 'updated note',
      })
      .expect(200)

    expect(response.body.point_valuation.value_per_point).toEqual({
      amount: 25_000,
      currency: 'eur',
      scale: 6,
    })
    expect(response.body.point_valuation.note).toBe('updated note')
  })
})

describe('DELETE /api/v1/my/rewards-program-point-valuations/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete('/api/v1/my/rewards-program-point-valuations/some-id').expect(401)
  })

  it('returns 404 for non-existent point valuation', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .delete('/api/v1/my/rewards-program-point-valuations/00000000-0000-7000-8000-000000000001')
      .expect(404)
  })
})
