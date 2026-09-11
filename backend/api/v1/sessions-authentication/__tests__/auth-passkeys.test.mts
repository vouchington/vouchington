import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestPasskey,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { v7 } from 'uuid'
describe('Passkey API Routes', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    await routeRateLimitConfig.waitForInitialization()
    // Unsubscribe from pub/sub to prevent cross-fork DynamicConfig messages
    // from re-enabling rate limiting mid-suite. close() is deferred to afterAll
    // so the singleton remains usable by other test files in the same fork.
    routeRateLimitConfig.unsubscribe()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  }, 15_000)

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  // ─── Registration options (requires auth) ─────────────────────────────────

  describe('POST /api/v1/auth/passkeys/registration/options', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.post('/api/v1/auth/passkeys/registration/options').send({}).expect(401)
    })

    it('returns WebAuthn registration options when authenticated', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.post('/api/v1/auth/passkeys/registration/options').send({}).expect(200)

      expect(res.body.options.challenge).toBeDefined()
      expect(res.body.options.rp).toBeDefined()
      expect(res.body.options.user).toBeDefined()
    })
  })

  // ─── Registration verify (requires auth) ──────────────────────────────────

  describe('POST /api/v1/auth/passkeys/registration/verify', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/passkeys/registration/verify')
        .send({ response: {}, name: 'My Key' })
        .expect(401)
    })

    it('returns 415 for non-JSON content type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/passkeys/registration/verify')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 when response field is missing', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req
        .post('/api/v1/auth/passkeys/registration/verify')
        .send({ name: 'My Key' })
        .expect(422)

      expect(res.body.message).toContain('response is required')
    })

    it('returns 400 when challenge is missing (not called options first)', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req
        .post('/api/v1/auth/passkeys/registration/verify')
        .send({ response: { id: 'fake' }, name: 'My Key' })
        .expect(400)

      expect(res.body.message).toContain('Registration challenge expired or not found')
    })
  })

  // ─── Passkey management (requires auth) ───────────────────────────────────

  describe('GET /api/v1/auth/passkeys', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.get('/api/v1/auth/passkeys').expect(401)
    })

    it('returns passkeys list for authenticated user', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.get('/api/v1/auth/passkeys').expect(200)

      expect(Array.isArray(res.body.results)).toBe(true)
    })
  })

  describe('PATCH /api/v1/auth/passkeys/:id', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.patch(`/api/v1/auth/passkeys/${v7()}`).send({ name: 'New Name' }).expect(401)
    })

    it('returns 415 for non-JSON content type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .patch(`/api/v1/auth/passkeys/${v7()}`)
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 for invalid name', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const emptyName = await req
        .patch(`/api/v1/auth/passkeys/${v7()}`)
        .send({ name: '   ' })
        .expect(422)
      expect(emptyName.body.message).toContain('name must be 1–100 characters')

      const tooLong = await req
        .patch(`/api/v1/auth/passkeys/${v7()}`)
        .send({ name: 'x'.repeat(101) })
        .expect(422)
      expect(tooLong.body.message).toContain('name must be 1–100 characters')
    })

    it('returns 404 for non-existent passkey', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req.patch(`/api/v1/auth/passkeys/${v7()}`).send({ name: 'New Name' }).expect(404)
    })

    it('renames a passkey and returns 204', async () => {
      const suffix = `rename-api-${Date.now()}`
      const passkey = await insertTestPasskey(user.id, suffix)

      const req = createRequest()
      await req.authenticateAs(user)

      await req.patch(`/api/v1/auth/passkeys/${passkey.id}`).send({ name: 'Renamed' }).expect(204)

      const listRes = await req.get('/api/v1/auth/passkeys').expect(200)
      const found = listRes.body.results.find((p: { id: string }) => p.id === passkey.id)
      expect(found?.name).toBe('Renamed')
    })
  })

  describe('DELETE /api/v1/auth/passkeys/:id', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.delete(`/api/v1/auth/passkeys/${v7()}`).expect(401)
    })

    it('returns 404 for non-existent passkey', async () => {
      // User needs >1 MFA method so the last-method re-auth check does not trigger
      const freshUser = await createTestUser()
      const suffix = `404-test-${Date.now()}`
      await insertTestPasskey(freshUser.id, `${suffix}-a`)
      await insertTestPasskey(freshUser.id, `${suffix}-b`)

      const req = createRequest()
      await req.authenticateAs(freshUser)

      await req.delete(`/api/v1/auth/passkeys/${v7()}`).expect(404)
    }, 20_000)

    it('deletes a passkey and returns 204', async () => {
      const suffix = `delete-api-${Date.now()}`
      const passkey = await insertTestPasskey(user.id, suffix)

      const req = createRequest()
      await req.authenticateAs(user)

      await req.delete(`/api/v1/auth/passkeys/${passkey.id}`).expect(204)

      const listRes = await req.get('/api/v1/auth/passkeys').expect(200)
      const found = listRes.body.results.find((p: { id: string }) => p.id === passkey.id)
      expect(found).toBeUndefined()
    })
  })
})
