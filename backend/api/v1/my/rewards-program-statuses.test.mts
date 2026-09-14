import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestRewardsProgram,
  insertTestRewardsProgramStatus,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'

describe('GET /api/v1/my/rewards-program-statuses', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/rewards-program-statuses').expect(401)
  })

  it('returns empty list for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/rewards-program-statuses').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('paginates in stable ascending ID order at partial and exact limits', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const statusIds = await Promise.all(
      Array.from({ length: 4 }, () => insertTestRewardsProgramStatus({ createdById: user.id })),
    )
    const created = [] as string[]
    for (const rewardsProgramStatusId of statusIds) {
      const response = await request
        .post('/api/v1/my/rewards-program-statuses')
        .send({ rewards_program_status_id: rewardsProgramStatusId })
        .expect(201)
      created.push(response.body.rewards_program_status.id)
    }

    const first = await request.get('/api/v1/my/rewards-program-statuses?limit=2').expect(200)
    expect(first.body.results.map((result: { id: string }) => result.id)).toEqual(
      [...first.body.results.map((result: { id: string }) => result.id)].sort(),
    )
    expect(first.body.results).toHaveLength(2)
    expect(first.body.page_info.has_next_page).toBe(true)

    const second = await request
      .get(
        `/api/v1/my/rewards-program-statuses?limit=2&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(second.body.results).toHaveLength(2)
    expect(second.body.page_info.has_next_page).toBe(false)
    expect(
      [...first.body.results, ...second.body.results].map((result: { id: string }) => result.id),
    ).toEqual([...created].sort())

    const partial = await request.get('/api/v1/my/rewards-program-statuses?limit=10').expect(200)
    expect(partial.body.results).toHaveLength(4)
    expect(partial.body.page_info.has_next_page).toBe(false)
  })

  it('rejects malformed, cross-user, and cross-collection cursors', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    await request
      .post('/api/v1/my/rewards-program-statuses')
      .send({ rewards_program_status_id: statusId })
    const page = await request.get('/api/v1/my/rewards-program-statuses?limit=1').expect(200)
    const cursor = page.body.page_info.end_cursor
    await request.get('/api/v1/my/rewards-program-statuses?after=not-a-cursor').expect(400)

    const otherRequest = createRequest()
    await otherRequest.authenticateAs(await createTestUser())
    await otherRequest
      .get(`/api/v1/my/rewards-program-statuses?after=${encodeURIComponent(cursor)}`)
      .expect(400)

    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const valuation = await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: programId,
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
      })
      .expect(201)
    const valuationPage = await request
      .get('/api/v1/my/rewards-program-point-valuations?limit=1')
      .expect(200)
    expect(valuation.body.point_valuation.id).toBeDefined()
    await request
      .get(
        `/api/v1/my/rewards-program-statuses?after=${encodeURIComponent(valuationPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('filters rows whose status topic has been deleted', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    await request
      .post('/api/v1/my/rewards-program-statuses')
      .send({ rewards_program_status_id: statusId })
    await softDeleteTopic(statusId, user.id)

    const response = await request.get('/api/v1/my/rewards-program-statuses').expect(200)
    expect(
      response.body.results.some(
        (result: { rewards_program_status_id: string }) =>
          result.rewards_program_status_id === statusId,
      ),
    ).toBe(false)
  })
})

describe('POST /api/v1/my/rewards-program-statuses', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/my/rewards-program-statuses').send({}).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/rewards-program-statuses')
      .set('Content-Type', 'text/plain')
      .send('rewards_program_status_id=x')
      .expect(415)
  })

  it('returns 400 when rewards_program_status_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/my/rewards-program-statuses').send({}).expect(400)
  })

  it('creates a rewards program status successfully', async () => {
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/rewards-program-statuses')
      .send({ rewards_program_status_id: statusId })
      .expect(201)
    expect(response.body.rewards_program_status.rewards_program_status_id).toBe(statusId)
  })
})

describe('PATCH /api/v1/my/rewards-program-statuses/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.patch('/api/v1/my/rewards-program-statuses/some-id').send({}).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .patch('/api/v1/my/rewards-program-statuses/some-id')
      .set('Content-Type', 'text/plain')
      .send('since=2024-01-01')
      .expect(415)
  })

  it('returns 422 for non-string since', async () => {
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/rewards-program-statuses')
      .send({ rewards_program_status_id: statusId })
      .expect(201)
    await request
      .patch(`/api/v1/my/rewards-program-statuses/${created.body.rewards_program_status.id}`)
      .send({ since: 999 })
      .expect(422)
  })

  it('returns 422 for impossible calendar dates', async () => {
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/rewards-program-statuses')
      .send({ rewards_program_status_id: statusId })
      .expect(201)

    await request
      .patch(`/api/v1/my/rewards-program-statuses/${created.body.rewards_program_status.id}`)
      .send({ until: '2026-02-31' })
      .expect(422)
  })
})

describe('DELETE /api/v1/my/rewards-program-statuses/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete('/api/v1/my/rewards-program-statuses/some-id').expect(401)
  })

  it('returns 404 for non-existent rewards program status', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .delete('/api/v1/my/rewards-program-statuses/00000000-0000-7000-8000-000000000001')
      .expect(404)
  })
})
