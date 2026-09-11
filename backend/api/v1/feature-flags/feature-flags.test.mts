import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeFeatureFlagCookie } from '@services/feature-flags'

describe('feature-flags', () => {
  let regularUser: PrivateUser

  beforeAll(async () => {
    regularUser = await createTestUser({ administrator: false })
  })
  describe('GET /api/v1/feature-flags', () => {
    it('returns flags without authentication', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/feature-flags').expect(200)

      expect(response.body).toHaveProperty('flags')
      expect(response.body).toHaveProperty('overrides')
      expect(typeof response.body.flags.memberships).toBe('boolean')
      expect(response.body.flags.fediverse).toBe(false)
    })

    it('returns flags for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      const response = await request.get('/api/v1/feature-flags').expect(200)

      expect(response.body).toHaveProperty('flags')
      expect(response.body).toHaveProperty('overrides')
      expect(typeof response.body.flags.memberships).toBe('boolean')
      expect(response.body.flags.fediverse).toBe(false)
    })

    it('returns merged flags when ff cookie is set', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      const ffCookie = encodeFeatureFlagCookie({ memberships: true })
      const response = await request
        .get('/api/v1/feature-flags')
        .set('Cookie', `${request.authCookie}; ff=${ffCookie}`)
        .expect(200)

      expect(response.body.flags.memberships).toBe(true)
      expect(response.body.overrides).toEqual({ memberships: true })
    })

    it('returns global flags when ff cookie is malformed', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      const response = await request
        .get('/api/v1/feature-flags')
        .set('Cookie', `${request.authCookie}; ff=not-valid-base64!!!`)
        .expect(200)

      expect(response.body).toHaveProperty('flags')
      expect(response.body.overrides).toEqual({})
    })

    it('does not apply overrides from base64 with invalid trailing characters', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      const malformedFfCookie = `${encodeFeatureFlagCookie({ memberships: true })}!!!`
      const response = await request
        .get('/api/v1/feature-flags')
        .set('Cookie', `${request.authCookie}; ff=${malformedFfCookie}`)
        .expect(200)

      expect(response.body.flags.memberships).toBe(false)
      expect(response.body.overrides).toEqual({})
    })
  })

  describe('PATCH /api/v1/feature-flags', () => {
    it('is not mounted because global updates go through dynamic config', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .patch('/api/v1/feature-flags')
        .send({ flags: { memberships: true } })
        .expect(404)
    })
  })
})
