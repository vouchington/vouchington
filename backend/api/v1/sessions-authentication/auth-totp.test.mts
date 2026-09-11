import { describe, it, expect, beforeAll } from 'vitest'
import * as OTPAuth from 'otpauth'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { v7 } from 'uuid'

describe('TOTP API Routes', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 15_000)

  // ─── POST /api/v1/auth/totp (setup) ───────────────────────────────────────

  describe('POST /api/v1/auth/totp', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.post('/api/v1/auth/totp').send({ name: 'Test' }).expect(401)
    })

    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/totp')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('creates a TOTP authenticator and returns setup data', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.post('/api/v1/auth/totp').send({ name: 'My App' }).expect(200)

      expect(res.body.secret).toBeTruthy()
      expect(res.body.uri).toMatch(/^otpauth:\/\/totp\//)
      expect(res.body.authenticator.id).toBeTruthy()
      expect(res.body.authenticator.name).toBe('My App')
    })

    it('uses default name when name not provided', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.post('/api/v1/auth/totp').send({}).expect(200)

      expect(res.body.authenticator.name).toBe('My Authenticator')
    })
  })

  // ─── POST /api/v1/auth/totp/setup/verification ────────────────────────────

  describe('POST /api/v1/auth/totp/setup/verification', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req
        .post('/api/v1/auth/totp/setup/verification')
        .send({ authenticator_id: v7(), code: '123456' })
        .expect(401)
    })

    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .post('/api/v1/auth/totp/setup/verification')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 without authenticator_id', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req
        .post('/api/v1/auth/totp/setup/verification')
        .send({ code: '123456' })
        .expect(422)

      expect(res.body.message).toContain('authenticator_id is required')
    })

    it('returns 422 without code', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req
        .post('/api/v1/auth/totp/setup/verification')
        .send({ authenticator_id: v7() })
        .expect(422)

      expect(res.body.message).toContain('code is required')
    })

    it('returns 401 for wrong code', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      // Create an authenticator first
      const setupRes = await req
        .post('/api/v1/auth/totp')
        .send({ name: 'Wrong Code Test' })
        .expect(200)

      await req
        .post('/api/v1/auth/totp/setup/verification')
        .send({ authenticator_id: setupRes.body.authenticator.id, code: '000000' })
        .expect(401)
    })

    it('verifies and returns authenticator', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const setupRes = await req
        .post('/api/v1/auth/totp')
        .send({ name: 'Verify Test App' })
        .expect(200)

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(setupRes.body.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })
      const code = totp.generate()

      const verifyRes = await req
        .post('/api/v1/auth/totp/setup/verification')
        .send({ authenticator_id: setupRes.body.authenticator.id, code })
        .expect(200)

      expect(verifyRes.body.authenticator.id).toBe(setupRes.body.authenticator.id)
      expect(verifyRes.body.authenticator.name).toBe('Verify Test App')
    })
  })

  // ─── GET /api/v1/auth/totp ────────────────────────────────────────────────

  describe('GET /api/v1/auth/totp', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.get('/api/v1/auth/totp').expect(401)
    })

    it('returns list of verified authenticators', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const suffix = `list-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const inserted = await insertTestTotpAuthenticator(user.id, suffix)

      const res = await req.get('/api/v1/auth/totp').expect(200)

      expect(Array.isArray(res.body.results)).toBe(true)
      const found = res.body.results.find((a: { id: string }) => a.id === inserted.id)
      expect(found).toBeDefined()
    })
  })

  // ─── PATCH /api/v1/auth/totp/:id ─────────────────────────────────────────

  describe('PATCH /api/v1/auth/totp/:id', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.patch(`/api/v1/auth/totp/${v7()}`).send({ name: 'New Name' }).expect(401)
    })

    it('returns 415 without JSON content-type', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req
        .patch(`/api/v1/auth/totp/${v7()}`)
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 for empty or too-long name', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const emptyNameRes = await req
        .patch(`/api/v1/auth/totp/${v7()}`)
        .send({ name: '   ' })
        .expect(422)
      expect(emptyNameRes.body.message).toContain('name must be 1–100 characters')

      const tooLongRes = await req
        .patch(`/api/v1/auth/totp/${v7()}`)
        .send({ name: 'x'.repeat(101) })
        .expect(422)
      expect(tooLongRes.body.message).toContain('name must be 1–100 characters')
    })

    it('returns 404 for non-existent authenticator', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      await req.patch(`/api/v1/auth/totp/${v7()}`).send({ name: 'New Name' }).expect(404)
    })

    it('renames the authenticator and returns 204', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const suffix = `rename-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const inserted = await insertTestTotpAuthenticator(user.id, suffix)

      await req.patch(`/api/v1/auth/totp/${inserted.id}`).send({ name: 'Renamed App' }).expect(204)

      const listRes = await req.get('/api/v1/auth/totp').expect(200)
      const found = listRes.body.results.find((a: { id: string }) => a.id === inserted.id)
      expect(found?.name).toBe('Renamed App')
    })
  })

  // ─── DELETE /api/v1/auth/totp/:id ────────────────────────────────────────

  describe('DELETE /api/v1/auth/totp/:id', () => {
    it('returns 401 without auth', async () => {
      const req = createRequest()
      await req.delete(`/api/v1/auth/totp/${v7()}`).expect(401)
    })

    it('returns 404 for non-existent authenticator', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      // Need a second TOTP so that MFA_REAUTH_REQUIRED is not triggered
      const suffix = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(user.id, suffix)

      await req.delete(`/api/v1/auth/totp/${v7()}`).expect(404)
    })

    it('deletes the authenticator when user has another MFA method', async () => {
      const req = createRequest()
      await req.authenticateAs(user)

      const suffix1 = `del-keep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const suffix2 = `del-target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestTotpAuthenticator(user.id, suffix1)
      const toDelete = await insertTestTotpAuthenticator(user.id, suffix2)

      await req.delete(`/api/v1/auth/totp/${toDelete.id}`).expect(204)

      const listRes = await req.get('/api/v1/auth/totp').expect(200)
      const found = listRes.body.results.find((a: { id: string }) => a.id === toDelete.id)
      expect(found).toBeUndefined()
    })

    it('returns MFA_REAUTH_REQUIRED when removing last MFA method without re_auth_token', async () => {
      // Create a fresh user with exactly one TOTP and no passkeys
      const singleMfaUser = await createTestUser()
      const req = createRequest()
      await req.authenticateAs(singleMfaUser)

      const suffix = `single-mfa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const onlyAuth = await insertTestTotpAuthenticator(singleMfaUser.id, suffix)

      const res = await req
        .delete(`/api/v1/auth/totp/${onlyAuth.id}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(422)

      expect(res.body.code).toBe('MFA_REAUTH_REQUIRED')
    }, 20_000)
  })
})
