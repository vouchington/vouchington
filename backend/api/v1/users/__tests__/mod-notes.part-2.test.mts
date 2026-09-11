import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, safeUsername } from '@voucha/test-helpers'

describe('GET /api/v1/users/:userId/moderation-context', () => {
  it('returns 401 for unauthenticated', async () => {
    const target = await createTestUser({ username: safeUsername('mn-ctx-anon') })
    const request = createRequest()
    await request.get(`/api/v1/users/${target.id}/moderation-context`).expect(401)
  })

  it('returns 403 for regular non-mod user', async () => {
    const user = await createTestUser({ username: safeUsername('mn-ctx-nomod') })
    const target = await createTestUser({ username: safeUsername('mn-ctx-nomod-tgt') })
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get(`/api/v1/users/${target.id}/moderation-context`).expect(403)
  })

  it('returns 200 with context and notes for site admin', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-ctx-admin-tgt') })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request.get(`/api/v1/users/${target.id}/moderation-context`).expect(200)

    expect(typeof response.body.context.account_age_ms).toBe('number')
    expect(Array.isArray(response.body.notes)).toBe(true)
    expect(response.body.page_info).toBeDefined()
  })
})

describe('GET /api/v1/users/:userId/mod-notes — pagination', () => {
  it('accepts a valid UUID after value', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-cursor-tgt') })

    const request = createRequest()
    await request.authenticateAs(admin)

    // Create two notes so there is something to paginate
    const first = await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'First note' })
      .set('Content-Type', 'application/json')
      .expect(201)

    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Second note' })
      .set('Content-Type', 'application/json')
      .expect(201)

    // Pass the first note's id as the continuation boundary.
    const response = await request
      .get(`/api/v1/users/${target.id}/mod-notes?after=${first.body.note.id}`)
      .expect(200)

    expect(Array.isArray(response.body.notes)).toBe(true)
  })

  it('rejects the legacy cursor query parameter', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-cursor-reject-tgt') })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.get(`/api/v1/users/${target.id}/mod-notes?cursor=${target.id}`).expect(400)
  })

  it('rejects an invalid after value', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-after-invalid-tgt') })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.get(`/api/v1/users/${target.id}/mod-notes?after=not-a-uuid`).expect(422)
  })
})

describe('POST /api/v1/users/:userId/mod-notes — FK violation', () => {
  it('returns 422 when community_id is a valid UUID but community does not exist', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-422-fk') })
    const request = createRequest()
    await request.authenticateAs(admin)

    // A well-formed UUID that does not reference any real community
    const nonExistentCommunityId = '01900000-0000-7000-8000-000000000099'

    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Some note', community_id: nonExistentCommunityId })
      .set('Content-Type', 'application/json')
      .expect(422)
  })
})
