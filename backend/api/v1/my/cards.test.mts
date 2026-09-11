import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createRandomString, createTestUser, insertTestCard } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { decodeCursor, encodeCursor } from '@modules/pagination'

describe('GET /api/v1/my/cards', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns page_info and honors after and limit', async () => {
    const paginationUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(paginationUser)
    for (let index = 0; index < 3; index += 1) {
      const cardId = await insertTestCard({ createdById: paginationUser.id })
      await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    }

    const first = await request.get('/api/v1/my/cards').query({ limit: 2 }).expect(200)
    expect(first.body.results).toHaveLength(2)
    expect(first.body.page_info).toMatchObject({ has_next_page: true })
    expect(first.body.page_info.end_cursor).toEqual(expect.any(String))

    const second = await request
      .get('/api/v1/my/cards')
      .query({ limit: 2, after: first.body.page_info.end_cursor })
      .expect(200)
    expect(second.body.results).toHaveLength(1)
    expect(second.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(new Set([...first.body.results, ...second.body.results].map(card => card.id)).size).toBe(
      3,
    )
  })

  it('rejects invalid limits and scoped cursors', async () => {
    const cursorUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(cursorUser)
    const cardId = await insertTestCard({ createdById: cursorUser.id })
    await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    const page = await request.get('/api/v1/my/cards').expect(200)
    const decoded = decodeCursor(page.body.page_info.start_cursor) as { id: string; scope: string }

    await request.get('/api/v1/my/cards').query({ limit: 0 }).expect(400)
    await request.get('/api/v1/my/cards').query({ after: 'invalid' }).expect(400)
    await request
      .get('/api/v1/my/cards')
      .query({ after: encodeCursor({ ...decoded, scope: `${decoded.scope}:tampered` }) })
      .expect(400)
  })

  it('does not expose individual ownership or database metadata', async () => {
    const contractUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(contractUser)
    const cardName = `API Contract Card ${createRandomString(8)}`
    const cardId = await insertTestCard({ createdById: contractUser.id, name: cardName })
    const created = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)

    expect(created.body.card).not.toHaveProperty('individual_id')
    expect(created.body.card).not.toHaveProperty('created_at')
    expect(created.body.card.card).toEqual({
      id: cardId,
      name: cardName,
      slug: expect.any(String),
    })
    expect(created.body.card.is_authorized_user).toBe(false)
    expect(created.body.card.authorized_user_of_card).toBeNull()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/cards').expect(401)
  })

  it('returns empty cards list for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/cards').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
  })
})

describe('POST /api/v1/my/cards', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/my/cards').send({ card_id: 'x' }).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/cards')
      .set('Content-Type', 'text/plain')
      .send('card_id=x')
      .expect(415)
  })

  it('returns 400 when card_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/my/cards').send({}).expect(400)
  })

  it('creates a card successfully', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    expect(response.body.card.card_id).toBe(cardId)
  })
})

describe('PATCH /api/v1/my/cards/:id', () => {
  let user: PrivateUser
  let userB: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    userB = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.patch('/api/v1/my/cards/some-id').send({}).expect(401)
  })

  it('returns 415 without Content-Type: application/json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .patch('/api/v1/my/cards/some-id')
      .set('Content-Type', 'text/plain')
      .send('note=hi')
      .expect(415)
  })

  it('returns 422 for invalid date format', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)
    const created = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    await request
      .patch(`/api/v1/my/cards/${created.body.card.id}`)
      .send({ opened_on: 'not-a-date' })
      .expect(422)
  })

  it('returns 422 for an impossible calendar date', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)
    const created = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    await request
      .patch(`/api/v1/my/cards/${created.body.card.id}`)
      .send({ received_sign_up_bonus_on: '2026-02-31' })
      .expect(422)
  })

  it('returns 422 for negative credit_limit', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    await request
      .patch(`/api/v1/my/cards/${created.body.card.id}`)
      .send({ credit_limit: { amount: -1, currency: 'usd' } })
      .expect(422)
  })

  it('rejects scaled credit_limit without changing the card', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)
    const created = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)

    await request
      .patch(`/api/v1/my/cards/${created.body.card.id}`)
      .send({ credit_limit: { amount: 500_000, currency: 'usd', scale: 6 } })
      .expect(422)
    const page = await request.get('/api/v1/my/cards').expect(200)
    expect(
      page.body.results.find((card: { id: string }) => card.id === created.body.card.id)
        ?.credit_limit,
    ).toBeNull()
  })

  it('returns 422 when authorized_user_of_id references the card itself', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    await request
      .patch(`/api/v1/my/cards/${created.body.card.id}`)
      .send({ authorized_user_of_id: created.body.card.id })
      .expect(422)
  })

  it('returns 404 for a card belonging to another user', async () => {
    const cardId = await insertTestCard({ createdById: userB.id })
    const requestB = createRequest()
    await requestB.authenticateAs(userB)
    const created = await requestB.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    const request = createRequest()
    await request.authenticateAs(user)
    await request.patch(`/api/v1/my/cards/${created.body.card.id}`).send({ note: 'hi' }).expect(404)
  })

  it('patches a card successfully', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request.post('/api/v1/my/cards').send({ card_id: cardId }).expect(201)
    const response = await request
      .patch(`/api/v1/my/cards/${created.body.card.id}`)
      .send({ opened_on: '2024-01-01', note: 'test note' })
      .expect(200)

    expect(response.body.card.opened_on).toBe('2024-01-01')
    expect(response.body.card.note).toBe('test note')
  })

  it('returns 422 when unsetting is_authorized_user without clearing authorized_user_of_id', async () => {
    const cardAId = await insertTestCard({ createdById: user.id })
    const cardBId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const createdA = await request.post('/api/v1/my/cards').send({ card_id: cardAId }).expect(201)
    const createdB = await request.post('/api/v1/my/cards').send({ card_id: cardBId }).expect(201)
    // Set card A as an authorized user of card B
    await request
      .patch(`/api/v1/my/cards/${createdA.body.card.id}`)
      .send({ is_authorized_user: true, authorized_user_of_id: createdB.body.card.id })
      .expect(200)

    // Unset is_authorized_user without clearing authorized_user_of_id — DB constraint rejects
    await request
      .patch(`/api/v1/my/cards/${createdA.body.card.id}`)
      .send({ is_authorized_user: false })
      .expect(422)
  })

  it('clears authorized_user_of_id when unsetting is_authorized_user', async () => {
    const cardAId = await insertTestCard({ createdById: user.id })
    const cardBId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)

    const createdA = await request.post('/api/v1/my/cards').send({ card_id: cardAId }).expect(201)
    const createdB = await request.post('/api/v1/my/cards').send({ card_id: cardBId }).expect(201)
    await request
      .patch(`/api/v1/my/cards/${createdA.body.card.id}`)
      .send({ is_authorized_user: true, authorized_user_of_id: createdB.body.card.id })
      .expect(200)

    // Sending both fields clears the relationship correctly
    const response = await request
      .patch(`/api/v1/my/cards/${createdA.body.card.id}`)
      .send({ is_authorized_user: false, authorized_user_of_id: null })
      .expect(200)

    expect(response.body.card.is_authorized_user).toBe(false)
    expect(response.body.card.authorized_user_of_id).toBeNull()
  })
})

describe('DELETE /api/v1/my/cards/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete('/api/v1/my/cards/some-id').expect(401)
  })

  it('returns 404 for non-existent card', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.delete('/api/v1/my/cards/00000000-0000-7000-8000-000000000001').expect(404)
  })
})
