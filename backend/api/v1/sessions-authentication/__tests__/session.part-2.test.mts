import { beforeEach, describe, expect, it } from 'vitest'

import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'

import {
  createDeviceAndSessionTokens,
  isSessionRevoked,
  revokeSession,
} from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { useRouteRateLimitConfigSnapshot } from '@voucha/test-helpers/api/route-rate-limit-config-snapshot'

import { v7 } from 'uuid'

describe('Session Routes', () => {
  useRouteRateLimitConfigSnapshot()

  describe('PATCH /api/v1/session', () => {
    it('rotates a revoked authenticated session even when its refresh check is still hot', async () => {
      const [did, sid] = [v7(), v7()]
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did,
        sid,
        uid: v7(),
      })
      await revokeSession(sid)

      const response = await createRequest()
        .patch('/api/v1/session')
        .send({
          dt: deviceToken.token,
          st: sessionToken.token,
        })
        .expect(200)

      expect(response.body.session.did).toBe(did)
      expect(response.body.session.dt).toBe(deviceToken.token)
      expect(response.body.session.sid).not.toBe(sid)
      expect(response.body.session.st).not.toBe(sessionToken.token)
      expect(response.body.session.uid).toBeNull()
    })
  })

  describe('DELETE /api/v1/session', () => {
    let deviceToken: string
    let sessionToken: string
    let did: string
    let sid: string

    beforeEach(async () => {
      did = v7()
      sid = v7()
      const tokens = await createDeviceAndSessionTokens({ did, sid })
      deviceToken = tokens.deviceToken.token
      sessionToken = tokens.sessionToken.token
    })

    it('should delete session and create new one (JSON)', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .send({ dt: deviceToken, st: sessionToken })
        .expect(200)

      expect(response.body.session.did).toBe(did)
      expect(response.body.session.dt).toBe(deviceToken)
      expect(response.body.session.st).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
      // New session should have different sid
      expect(response.body.session.sid).not.toBe(sid)
    })

    it('should create new device and session when no tokens provided', async () => {
      const request = createRequest()
      const response = await request.delete('/api/v1/session').send({}).expect(200)

      expect(response.body.session.dt).toBeDefined()
      expect(response.body.session.st).toBeDefined()
      expect(response.body.session.did).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
    })

    it('should delete session using cookie tokens for non-JSON requests', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .set('Cookie', [`dt=${deviceToken}`, `st=${sessionToken}`].join('; '))
        .expect(200)

      expect(response.body.session.did).toBe(did)
      expect(response.body.session.dt).toBe(deviceToken)
      expect(response.body.session.st).not.toBe(sessionToken)
    })

    it('should handle invalid session token gracefully', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .send({ dt: deviceToken, st: 'invalid-token' })
        .expect(200)

      expect(response.body.session.did).toBe(did)
      expect(response.body.session.dt).toBe(deviceToken)
      expect(response.body.session.st).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
    })

    it('should create new device when device token is invalid', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .send({ dt: 'invalid', st: sessionToken })
        .expect(200)

      expect(response.body.session.dt).toBeDefined()
      expect(response.body.session.st).toBeDefined()
      expect(response.body.session.did).toBeDefined()
      expect(response.body.session.sid).toBeDefined()
    })

    it('should not return invalid device token when dt jwt is invalid (device ids must match)', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .send({ dt: 'invalid-token', st: sessionToken })
        .expect(200)

      // Should issue a new device token, not return the invalid one
      expect(response.body.session.dt).not.toBe('invalid-token')
      // The new dt should be a valid JWT (not the garbage we sent)
      expect(response.body.session.dt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
    })

    it('should preserve the original device token when valid (not refresh it)', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .send({ dt: deviceToken, st: sessionToken })
        .expect(200)

      // The device token should be preserved, not replaced with a newly generated one
      expect(response.body.session.dt).toBe(deviceToken)
      // The session token should be a new one
      expect(response.body.session.st).not.toBe(sessionToken)
    })

    it('should always return uid as null', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .send({ dt: deviceToken, st: sessionToken })
        .expect(200)

      expect(response.body.session.uid).toBeNull()
    })

    it('should return 422 for malformed JSON body', async () => {
      const request = createRequest()
      await request
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .send('not valid json{')
        .expect(422)
    })

    it('rate-limits malformed JSON before returning the parse error', async () => {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 1,
        anon_write_ttl: 60,
      })

      const request = createRequest()
      const ip = nextTestRequestIp()
      await request
        .delete('/api/v1/session')
        .set('Content-Type', 'application/json')
        .set('x-forwarded-for', ip)
        .send('not valid json{')
        .expect(429)
    })

    it('should not store a revocation marker for an anonymous valid pair', async () => {
      const request = createRequest()
      await request
        .delete('/api/v1/session')
        .send({ dt: deviceToken, st: sessionToken })
        .expect(200)

      expect(await isSessionRevoked(sid)).toBe(false)
    })

    it('should revoke the session when dt and st are a uid-bearing valid pair', async () => {
      const request = createRequest()
      const authenticatedSid = v7()
      const authenticatedTokens = await createDeviceAndSessionTokens({
        did: v7(),
        sid: authenticatedSid,
        uid: v7(),
      })

      await request
        .delete('/api/v1/session')
        .send({
          dt: authenticatedTokens.deviceToken.token,
          st: authenticatedTokens.sessionToken.token,
        })
        .expect(200)

      expect(await isSessionRevoked(authenticatedSid)).toBe(true)
    })

    it('should not revoke session when dt and st are from different devices (#1956)', async () => {
      const request = createRequest()
      const victimDid = v7()
      const victimSid = v7()
      const attackerDid = v7()
      const victim = await createDeviceAndSessionTokens({ did: victimDid, sid: victimSid })
      const attacker = await createDeviceAndSessionTokens({ did: attackerDid })

      await request
        .delete('/api/v1/session')
        .send({
          dt: attacker.deviceToken.token,
          st: victim.sessionToken.token,
        })
        .expect(200)

      expect(await isSessionRevoked(victimSid)).toBe(false)
    })

    it('should not revoke the session when dt is missing', async () => {
      const request = createRequest()
      await request.delete('/api/v1/session').send({ st: sessionToken }).expect(200)

      expect(await isSessionRevoked(sid)).toBe(false)
    })

    it('should not revoke the session when dt is invalid', async () => {
      const request = createRequest()
      await request
        .delete('/api/v1/session')
        .send({ dt: 'invalid-token', st: sessionToken })
        .expect(200)

      expect(await isSessionRevoked(sid)).toBe(false)
    })

    it('should return the attested session max-age when re-using an attested device token', async () => {
      const request = createRequest()
      const attestedDid = v7()
      const { deviceToken: attestedDeviceToken } = await createDeviceAndSessionTokens({
        did: attestedDid,
        deviceClass: 'attested',
      })

      const response = await request
        .delete('/api/v1/session')
        .send({ dt: attestedDeviceToken.token })
        .expect(200)

      expect(response.body.session.ste).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    })

    it('should return the default session max-age when re-using a non-attested device token', async () => {
      const request = createRequest()
      const response = await request
        .delete('/api/v1/session')
        .send({ dt: deviceToken, st: sessionToken })
        .expect(200)

      expect(response.body.session.ste).toBe(SESSION_EXPIRATION_SECONDS)
    })
  })
})
