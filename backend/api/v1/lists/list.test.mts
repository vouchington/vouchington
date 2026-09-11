import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createRandomString } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/lists/:id', () => {
  let user: PrivateUser
  let publicListId: string
  let privateListId: string

  beforeAll(async () => {
    user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const r1 = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Public ${createRandomString(8)}`, visibility: 'public' })
    publicListId = r1.body.list.id

    const r2 = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Private ${createRandomString(8)}`, visibility: 'private' })
    privateListId = r2.body.list.id
  })

  it('returns a public list without auth', async () => {
    const request = createRequest()
    const response = await request.get(`/api/v1/lists/${publicListId}`).expect(200)
    expect(response.body.list.id).toBe(publicListId)
  })

  it('returns 404 for private list without auth', async () => {
    const request = createRequest()
    await request.get(`/api/v1/lists/${privateListId}`).expect(404)
  })

  it('returns private list for owner', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/lists/${privateListId}`).expect(200)
    expect(response.body.list.id).toBe(privateListId)
  })

  it('returns 404 for non-existent list', async () => {
    const request = createRequest()
    await request.get('/api/v1/lists/00000000-0000-7000-8000-000000000000').expect(404)
  })

  it('returns 422 for invalid UUID param', async () => {
    const request = createRequest()
    await request.get('/api/v1/lists/not-a-uuid').expect(422)
  })
})

describe('PATCH /api/v1/lists/:id', () => {
  let user: PrivateUser
  let listId: string

  beforeAll(async () => {
    user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Patch ${createRandomString(8)}` })
    listId = r.body.list.id
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'x' })
      .expect(401)
  })

  it('returns 403 for non-owner', async () => {
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'x' })
      .expect(403)
  })

  it('updates the list name', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const newName = `Updated ${createRandomString(8)}`
    const response = await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ name: newName })
      .expect(200)
    expect(response.body.list.name).toBe(newName)
  })

  it('returns 422 when name exceeds 255 characters', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'a'.repeat(256) })
      .expect(422)
  })

  it('returns 422 for invalid visibility value', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ visibility: 'secret' })
      .expect(422)
  })

  it('accepts JSON null body as no-op', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(200)
  })

  it('returns 422 when body is a JSON primitive', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send('"some-string"')
      .expect(422)
  })

  it('returns 422 when name is not a string', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ name: 42 })
      .expect(422)
  })

  it('returns 422 when description is not a string or null', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ description: 42 })
      .expect(422)
  })

  it('returns 404 for soft-deleted list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Deleted PATCH ${createRandomString(8)}` })
    const id = r.body.list.id
    await request.delete(`/api/v1/lists/${id}`).expect(204)
    await request
      .patch(`/api/v1/lists/${id}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'x' })
      .expect(404)
  })
})

describe('DELETE /api/v1/lists/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request.delete('/api/v1/lists/00000000-0000-7000-8000-000000000000').expect(401)
  })

  it('soft-deletes the list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Delete ${createRandomString(8)}` })
    const id = r.body.list.id
    await request.delete(`/api/v1/lists/${id}`).expect(204)
    // After soft-delete: private list returns 404 to owner
    await request.get(`/api/v1/lists/${id}`).expect(404)
  })

  it('returns 403 for non-owner', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Perm ${createRandomString(8)}` })
    const id = r.body.list.id

    const other = await createTestUser()
    const request2 = createRequest()
    await request2.authenticateAs(other)
    await request2.delete(`/api/v1/lists/${id}`).expect(403)
  })

  it('returns 404 on double delete', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Double Delete ${createRandomString(8)}` })
    const id = r.body.list.id
    await request.delete(`/api/v1/lists/${id}`).expect(204)
    await request.delete(`/api/v1/lists/${id}`).expect(404)
  })
})
