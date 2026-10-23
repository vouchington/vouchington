import { expectAuthSessionEvent } from '@voucha/test-helpers/auth-session-events'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v7 } from 'uuid'
import * as jose from 'jose'
import { signSessionJwt, verifyDeviceJwt, type DeviceClass } from '@ts-shared/session-jwt'
import {
  createTestUser,
  getTestPrivateUserById,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { refreshSessionState } from './flows.mts'
import { applyHotWarmCold } from './hot-warm-cold.mts'
import { isSessionRevoked, revokeSession } from './revocation.mts'
import { markJwtStale } from './invalidation.mts'
import { revokeAllAuthenticatedSessions } from './user-session-revocation.mts'
import { revokeUserSessionsBefore } from './session-revocation-keys.mts'
import { createDeviceAndSessionTokens } from './create.mts'

const TEST_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0'

describe('flows warm and cold paths', () => {
  let testDir: string
  let originalAnalyticsLocalDir: string | undefined
  let originalAnalyticsBackend: string | undefined

  beforeAll(async () => {
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jwt-session-flows-part2-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true })
    if (originalAnalyticsLocalDir === undefined) {
      delete process.env.ANALYTICS_LOCAL_DIR
    } else {
      process.env.ANALYTICS_LOCAL_DIR = originalAnalyticsLocalDir
    }

    if (originalAnalyticsBackend === undefined) {
      delete process.env.ANALYTICS_BACKEND
    } else {
      process.env.ANALYTICS_BACKEND = originalAnalyticsBackend
    }
  })

  // Create a device+session token pair with sca in the past to exercise the warm path
  async function makeWarmPathTokens(
    uid: string,
    rcaOffsetSeconds = 3600,
    uil?: string | null,
    deviceClass?: DeviceClass,
  ) {
    const [did, sid] = [v7(), v7()]
    const now = Math.floor(Date.now() / 1000)
    const userAgent = deviceClass === 'attested' ? undefined : TEST_USER_AGENT
    const tokens = await createDeviceAndSessionTokens({
      did,
      sid,
      uid,
      ...(deviceClass !== undefined && { deviceClass }),
      ...(userAgent && { deviceContext: { user_agent: userAgent } }),
    })
    const sessionToken = await signSessionJwt(
      {
        ...tokens.sessionToken.payload,
        ...(uil !== undefined ? { uil } : {}),
        sca: now - 10,
        rca: now + rcaOffsetSeconds,
      },
      { expiresIn: '2 days' },
    )
    return { did, sid, deviceToken: tokens.deviceToken.token, sessionToken, userAgent }
  }

  function expectAttestedSessionLifetime(st: string): void {
    const decoded = jose.decodeJwt(st)
    const lifetimeSeconds = (decoded.exp as number) - (decoded.iat as number)
    expect(lifetimeSeconds).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 1)
    expect(lifetimeSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60 + 1)
  }

  describe('refreshSessionState', () => {
    it('warm path: issues anon session when session is revoked', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken, sid, userAgent } = await makeWarmPathTokens(user.id)
      await revokeSession(sid)
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
        userAgent,
      })
      expect(result.uid).toBeNull()
      expect(result.st).not.toBe(sessionToken)
      await expectAuthSessionEvent(testDir, result.did, result.sid, 'refreshed_anonymous')
    })

    it('warm path: issues anon session when all user sessions were revoked', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken, userAgent } = await makeWarmPathTokens(user.id)

      await revokeAllAuthenticatedSessions(user.id)

      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
        userAgent,
      })
      expect(result.uid).toBeNull()
      expect(result.st).not.toBe(sessionToken)
      await expectAuthSessionEvent(testDir, result.did, result.sid, 'refreshed_anonymous')
    }, 20_000)

    it('warm path: applies user-wide revocation cutoff in the combined Valkey check', async () => {
      const user = await createTestUser()
      const uid = user.id
      const revokedTokens = await makeWarmPathTokens(uid, 3600, undefined, 'attested')
      const device = await verifyDeviceJwt(revokedTokens.deviceToken)
      const cutoffSeconds = device!.iat!
      await revokeUserSessionsBefore(uid, cutoffSeconds)
      const freshTokens = await makeWarmPathTokens(uid, 3600, undefined, 'attested')

      const revokedResult = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken: revokedTokens.deviceToken,
        sessionToken: revokedTokens.sessionToken,
      })
      const freshResult = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken: freshTokens.deviceToken,
        sessionToken: freshTokens.sessionToken,
      })

      expect(revokedResult.uid).toBeNull()
      expect(revokedResult.st).not.toBe(revokedTokens.sessionToken)
      expect(freshResult.uid).toBe(uid)
      expect(freshResult.sid).toBe(freshTokens.sid)
      expect(freshResult.st).not.toBe(freshTokens.sessionToken)
    })

    it('warm path: treats missing issued-at as before a user-wide revocation cutoff', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did: v7(),
        uid: user.id,
        deviceContext: { user_agent: TEST_USER_AGENT },
      })
      const did = deviceToken.payload.did
      const sid = sessionToken.payload.sid
      const now = Math.floor(Date.now() / 1000)

      await revokeUserSessionsBefore(user.id, now)

      const result = await applyHotWarmCold(
        {
          did,
          sid,
          uid: user.id,
          client: 'web',
          ua_hash: deviceToken.payload.ua_hash,
          sca: now - 10,
          rca: now + 3600,
        },
        did,
        deviceToken.token,
        getTestPrivateUserById,
      )

      expect(result.uid).toBeNull()
      expect(result.st).not.toBe('session-token')
    })

    it('warm path: re-issues with existing enrichment when not stale and rca not reached', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken, sid, userAgent } = await makeWarmPathTokens(
        user.id,
        3600,
        'fr',
      )
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
        userAgent,
      })
      // Same uid + sid, new token with refreshed sca
      expect(result.uid).toBe(user.id)
      expect(result.sid).toBe(sid)
      expect(result.st).not.toBe(sessionToken)
      expect(result.session.uil).toBe('fr')
    })

    it('warm path: forces cold path reload when user claims are stale', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken, userAgent } = await makeWarmPathTokens(user.id)
      await markJwtStale(user.id)
      let fetchCalls = 0
      const result = await refreshSessionState({
        fetchUser: async userId => {
          fetchCalls += 1
          return getTestPrivateUserById(userId)
        },
        deviceToken,
        sessionToken,
        userAgent,
      })
      expect(fetchCalls).toBe(1)
      expect(result.uid).toBe(user.id)
    })

    it('warm path: preserves dc:attested (30-day st) when re-issuing with existing enrichment', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(
        user.id,
        3600,
        'fr',
        'attested',
      )
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      expect(result.uid).toBe(user.id)
      expect(result.st).not.toBe(sessionToken)
      expect(result.deviceClass).toBe('attested')
      expectAttestedSessionLifetime(result.st)
    })

    it('cold path: preserves dc:attested (30-day st) on the anon fallback when user claims are stale', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(
        user.id,
        3600,
        undefined,
        'attested',
      )
      await markJwtStale(user.id)
      const result = await refreshSessionState({
        fetchUser: async () => null,
        deviceToken,
        sessionToken,
      })
      // The user was removed from the account lookup after the authoritative session was minted.
      expect(result.uid).toBeNull()
      expect(result.deviceClass).toBe('attested')
      expectAttestedSessionLifetime(result.st)
    })

    it('cold path: retains an authenticated session when a real user is suspended', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken, sid } = await makeWarmPathTokens(user.id)
      await markJwtStale(user.id)
      await suspendTestUser(user.id)
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
        userAgent: TEST_USER_AGENT,
      })
      expect(result.uid).toBe(user.id)
      expect(result.sid).toBe(sid)
      expect(result.st).not.toBe(sessionToken)
      await expect(isSessionRevoked(sid, { userId: user.id })).resolves.toBe(false)
      await unsuspendTestUser(user.id)
    }, 20_000)

    it('cold path: re-mints session with reloaded claims for a real, non-suspended user', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(user.id)
      await markJwtStale(user.id)

      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
        userAgent: TEST_USER_AGENT,
      })
      expect(result.uid).toBe(user.id)
      expect(result.st).not.toBe(sessionToken)
    }, 20_000)
  })
})
