import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/aside-preferences', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/aside-preferences').expect(401)
  })

  it('returns empty array for user with no dismissed asides', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/aside-preferences').expect(200)
    expect(Array.isArray(response.body.aside_preferences)).toBe(true)
  })
})

describe('POST /api/v1/my/aside-preferences', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/my/aside-preferences').expect(401)
  })

  it('returns 415 when content-type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/aside-preferences')
      .set('Content-Type', 'text/plain')
      .send('aside_key=test')
      .expect(415)
  })

  it('returns 400 when aside_key is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/my/aside-preferences').send({}).expect(400)
  })

  it('dismisses an aside and returns 204', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/aside-preferences')
      .send({ aside_key: 'trending-topics' })
      .expect(204)

    const response = await request.get('/api/v1/my/aside-preferences').expect(200)
    const keys = (response.body.aside_preferences as Array<{ aside_key: string }>).map(
      p => p.aside_key,
    )
    expect(keys).toContain('trending-topics')
  })

  it('is idempotent (upsert)', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/aside-preferences')
      .send({ aside_key: 'curated-topics' })
      .expect(204)
    await request
      .post('/api/v1/my/aside-preferences')
      .send({ aside_key: 'curated-topics' })
      .expect(204)
  })
})

describe('DELETE /api/v1/my/aside-preferences/:asideKey', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete('/api/v1/my/aside-preferences/trending-topics').expect(401)
  })

  it('restores a dismissed aside and returns 204', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/aside-preferences')
      .send({ aside_key: 'trending-communities' })
      .expect(204)

    await request.delete('/api/v1/my/aside-preferences/trending-communities').expect(204)

    const response = await request.get('/api/v1/my/aside-preferences').expect(200)
    const keys = (response.body.aside_preferences as Array<{ aside_key: string }>).map(
      p => p.aside_key,
    )
    expect(keys).not.toContain('trending-communities')
  })

  it('is a no-op for keys that were not dismissed', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/my/aside-preferences/non-existent-aside').expect(204)
  })
})
