import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestHouseholdMembership,
  insertTestSpendingCategory,
} from '@voucha/test-helpers'
import { getOrCreateHousehold } from '@services/individuals-households'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/spending-categories', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/spending-categories').expect(401)
  })

  it('returns empty list for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/spending-categories').expect(200)
    expect(response.body.results).toEqual([])
  })

  it('uses an opaque cursor to return a bounded, non-overlapping next page', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    await request
      .post('/api/v1/my/spending-categories')
      .send({ spending_category_id: categoryId, amount: { amount: 100, currency: 'usd' } })
      .expect(201)
    await request
      .post('/api/v1/my/spending-categories')
      .send({ spending_category_id: categoryId, amount: { amount: 200, currency: 'usd' } })
      .expect(201)
    const first = await request.get('/api/v1/my/spending-categories?limit=1').expect(200)
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(first.body.page_info.end_cursor).toEqual(expect.any(String))
    const second = await request
      .get(
        `/api/v1/my/spending-categories?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(second.body.results[0].id).not.toBe(first.body.results[0].id)
  })

  it('does not expose ownership identifiers or timestamps in list entries', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/spending-categories?limit=1').expect(200)
    const entry = response.body.results[0]
    if (!entry) return
    expect(entry).toMatchObject({
      can_manage: expect.any(Boolean),
      owner_type: expect.stringMatching(/^(individual|household)$/),
    })
    expect(entry).not.toHaveProperty('individual_id')
    expect(entry).not.toHaveProperty('household_id')
    expect(entry).not.toHaveProperty('created_at')
    expect(entry).not.toHaveProperty('updated_at')
  })

  it('returns shared household entries as read-only to members and rejects member mutations', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const household = await getOrCreateHousehold(owner)
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: member.individual_id!,
    })
    const categoryId = await insertTestSpendingCategory({ createdById: owner.id })
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    const shared = await ownerRequest
      .post('/api/v1/my/spending-categories')
      .send({
        spending_category_id: categoryId,
        amount: { amount: 10_000, currency: 'usd' },
        household_id: household.id,
      })
      .expect(201)

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    const list = await memberRequest.get('/api/v1/my/spending-categories').expect(200)
    expect(list.body.results).toContainEqual(
      expect.objectContaining({
        id: shared.body.spending_category.id,
        owner_type: 'household',
        can_manage: false,
      }),
    )
    await memberRequest
      .patch(`/api/v1/my/spending-categories/${shared.body.spending_category.id}`)
      .send({ amount: { amount: 20_000, currency: 'usd' } })
      .expect(403)
    await memberRequest
      .delete(`/api/v1/my/spending-categories/${shared.body.spending_category.id}`)
      .expect(403)

    const ownerList = await ownerRequest.get('/api/v1/my/spending-categories').expect(200)
    expect(ownerList.body.results).toContainEqual(
      expect.objectContaining({ id: shared.body.spending_category.id, can_manage: true }),
    )
  })
})

describe('POST /api/v1/my/spending-categories', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/my/spending-categories').send({}).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/spending-categories')
      .set('Content-Type', 'text/plain')
      .send('amount=100')
      .expect(415)
  })

  it('returns 400 when spending_category_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/my/spending-categories').send({ amount: 100 }).expect(400)
  })

  it('returns 422 when spending_category_id is not a UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/spending-categories')
      .send({ spending_category_id: 'not-a-uuid', amount: 100 })
      .expect(422)
  })

  it('returns 422 for non-string spending_frequency', async () => {
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/spending-categories')
      .send({
        spending_category_id: categoryId,
        amount: { amount: 10_000, currency: 'usd' },
        spending_frequency: 123,
      })
      .expect(422)
  })

  it('rejects scaled amount without creating a spending entry', async () => {
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/spending-categories')
      .send({
        spending_category_id: categoryId,
        amount: { amount: 10_000, currency: 'usd', scale: 6 },
      })
      .expect(422)

    const page = await request.get('/api/v1/my/spending-categories').expect(200)
    expect(
      page.body.results.some(
        (entry: { spending_category_id: string }) => entry.spending_category_id === categoryId,
      ),
    ).toBe(false)
  })

  it('creates a spending category successfully', async () => {
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/spending-categories')
      .send({
        spending_category_id: categoryId,
        amount: { amount: 5_000, currency: 'usd' },
        spending_frequency: 'monthly',
      })
      .expect(201)
    expect(response.body.spending_category.spending_category_id).toBe(categoryId)
  })
})

describe('PATCH /api/v1/my/spending-categories/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.patch('/api/v1/my/spending-categories/some-id').send({}).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .patch('/api/v1/my/spending-categories/some-id')
      .set('Content-Type', 'text/plain')
      .send('amount=100')
      .expect(415)
  })

  it('returns 422 for non-string spending_frequency', async () => {
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/spending-categories')
      .send({ spending_category_id: categoryId, amount: { amount: 5_000, currency: 'usd' } })
      .expect(201)
    await request
      .patch(`/api/v1/my/spending-categories/${created.body.spending_category.id}`)
      .send({ spending_frequency: 999 })
      .expect(422)
  })

  it('patches a spending category successfully', async () => {
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request
      .post('/api/v1/my/spending-categories')
      .send({ spending_category_id: categoryId, amount: { amount: 5_000, currency: 'usd' } })
      .expect(201)
    const response = await request
      .patch(`/api/v1/my/spending-categories/${created.body.spending_category.id}`)
      .send({
        amount: { amount: 7_500, currency: 'usd' },
        spending_frequency: 'annually',
      })
      .expect(200)

    expect(response.body.spending_category.amount).toEqual({ amount: 7_500, currency: 'usd' })
    expect(response.body.spending_category.spending_frequency).toBe('annually')
    expect(response.body.spending_category.id).toBe(created.body.spending_category.id)
  })
})

describe('DELETE /api/v1/my/spending-categories/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete('/api/v1/my/spending-categories/some-id').expect(401)
  })

  it('returns 404 for non-existent spending category', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .delete('/api/v1/my/spending-categories/00000000-0000-7000-8000-000000000001')
      .expect(404)
  })
})
