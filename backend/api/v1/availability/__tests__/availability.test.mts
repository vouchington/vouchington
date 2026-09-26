import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createRandomString, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createTopic } from '@services/topics/create'

function randomSlug(prefix?: string): string {
  const suffix = createRandomString(8)
  return prefix ? `${prefix}-${suffix}` : suffix
}

describe('GET /api/v1/availability', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = (await createTestUser({ administrator: true })) as PrivateUser
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/availability?kind=topic-slug&value=some-slug').expect(401)
  })

  it('returns 400 when kind is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/availability?value=some-slug').expect(400)
  })

  it('returns 400 when kind is invalid', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/availability?kind=invalid-kind&value=some-slug').expect(400)
  })

  it('returns 400 when value is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/availability?kind=topic-slug').expect(400)
  })

  it('returns 200 with available: true for a nonsense slug', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/availability?kind=topic-slug&value=totally-nonexistent-${randomSlug()}`)
      .expect(200)
    expect(response.body.available).toBe(true)
    expect(response.body.conflict).toBeNull()
  })

  it('returns 200 with available: false and topic conflict for a taken topic slug', async () => {
    const slug = `avail-test-${randomSlug()}`
    await createTopic(WEB_PROVENANCE, admin, {
      name: `Availability Test ${randomSlug()}`,
      slug,
      topic_type: 'topic',
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/availability?kind=topic-slug&value=${slug}`)
      .expect(200)
    expect(response.body.available).toBe(false)
    expect(response.body.conflict).toMatchObject({
      kind: 'topic',
      slug,
    })
  })

  it('returns 403 when a non-admin checks a post slug', async () => {
    const user = (await createTestUser()) as PrivateUser
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get(`/api/v1/availability?kind=post-slug&value=some-${randomSlug()}`).expect(403)
  })

  it('returns 200 when an admin checks a post slug', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/availability?kind=post-slug&value=nonexistent-${randomSlug()}`)
      .expect(200)
    expect(response.body.available).toBe(true)
    expect(response.body.conflict).toBeNull()
  })
})
