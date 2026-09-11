import { describe, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('response-helpers', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  /**
   * These tests exercise the response-helpers via routes that adopt them:
   * - requireAuth via GET /api/v1/my/notifications
   * - getOptionalAuthAndRateLimit via GET /api/v1/topics
   * - requireAuthAndRateLimit via GET /api/v1/crm/contacts
   * - validateUUIDParam and parseJsonBody via /api/v1/crm/contacts/:id
   *
   * The getOptionalAuthAndRateLimit cases use a random no-match `q` marker: /api/v1/topics is the
   * heaviest list endpoint in the app (search, then five requested-topic set aggregates,
   * view_topic_elections, markdown rendering, bookmarks,
   * election votes), none of which this suite tests. A guaranteed-zero-row search still runs the
   * full auth/rate-limit preamble and still returns 200, but skips the hydration fan-out entirely
   * (see the deflake plan referenced at CI run 33808851418 / job 100825925020). Do not "simplify"
   * this back to a bare /api/v1/topics request.
   */

  describe('requireAuth', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/my/notifications').expect(401)
    })

    it('returns 200 when authenticated', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/my/notifications').expect(200)
    })
  })

  describe('getOptionalAuthAndRateLimit', () => {
    const noMatchQuery = `/api/v1/topics?q=${encodeURIComponent(`no-match-${crypto.randomUUID()}`)}`

    it('returns 200 when unauthenticated', async () => {
      const request = createRequest()
      await request.get(noMatchQuery).expect(200)
    })

    it('returns 200 when authenticated', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(noMatchQuery).expect(200)
    })
  })

  describe('requireAuthAndRateLimit', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/crm/contacts').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/crm/contacts').expect(403)
    })
  })

  describe('validateUUIDParam', () => {
    it('returns 422 for an invalid UUID in a route param', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/crm/contacts/not-a-uuid').expect(422)
    })

    it('passes through a valid UUID', async () => {
      // A real UUID that doesn't exist should get a 404, not a 422
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/crm/contacts/00000000-0000-0000-0000-000000000099').expect(404)
    })
  })

  describe('parseJsonBody', () => {
    it('returns 415 when content-type is not JSON', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/crm/contacts')
        .set('Content-Type', 'text/plain')
        .send('name=test')
        .expect(415)
    })
  })
})
