import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createRandomString } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/lists', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/lists').expect(401)
  })

  it('returns 200 with empty results for new user', async () => {
    const newUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(newUser)
    const response = await request.get('/api/v1/lists').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body).toHaveProperty('page_info')
    expect(response.body).toHaveProperty('lists')
  })

  it('returns lists for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const name = `API List ${createRandomString(8)}`
    await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name })
      .expect(201)
    const response = await request.get('/api/v1/lists').expect(200)
    expect(response.body.results.length).toBeGreaterThanOrEqual(1)
  })
})

describe('POST /api/v1/lists', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: 'x' })
      .expect(401)
  })

  it('creates a list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const name = `Create Test ${createRandomString(8)}`
    const response = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name })
      .expect(201)
    expect(response.body.list.name).toBe(name)
    expect(response.body.list.visibility).toBe('private')
  })

  it('creates a list with visibility and description', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const name = `Public List ${createRandomString(8)}`
    const response = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name, description: 'desc', visibility: 'public' })
      .expect(201)
    expect(response.body.list.visibility).toBe('public')
    expect(response.body.list.description).toBe('desc')
  })

  it('returns 422 when name missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/lists').set('Content-Type', 'application/json').send({}).expect(422)
  })

  it('returns 415 when Content-Type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/lists').send('name=test').expect(415)
  })

  it('returns 422 when name exceeds 255 characters', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: 'a'.repeat(256) })
      .expect(422)
  })

  it('returns 422 for invalid visibility value', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: 'test', visibility: 'secret' })
      .expect(422)
  })

  it('returns 422 when body is JSON null', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
  })

  it('returns 422 when name is not a string', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: ['foo'] })
      .expect(422)
  })

  it('returns 422 when description is not a string or null', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: 'test', description: 42 })
      .expect(422)
  })
})
