import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v7 } from 'uuid'
import * as jose from 'jose'
import { signDeviceJwt, signSessionJwt, type DeviceClass } from '@ts-shared/session-jwt'
import { flush } from '@data-stores/analytics/backend-local'
import {
  createTestUser,
  getTestPrivateUserById,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { refreshSessionState } from './flows.mts'
import { applyHotWarmCold } from './hot-warm-cold.mts'
import { revokeSession } from './revocation.mts'
import { markJwtStale } from './invalidation.mts'
import { revokeAllAuthenticatedSessions } from './user-sessions.mts'
import { revokeUserSessionsBefore } from './session-revocation-keys.mts'

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
    issuedAtSeconds = Math.floor(Date.now() / 1000),
  ) {
    const did = v7()
    const sid = v7()
    const now = Math.floor(Date.now() / 1000)
    const deviceToken = await signDeviceJwt(
      { did, ...(deviceClass !== undefined ? { dc: deviceClass } : {}) },
      { expiresIn: '30 days' },
    )
    const sessionToken = await signSessionJwt(
      {
        did,
        sid,
        uid,
        ...(uil !== undefined ? { uil } : {}),
        sca: now - 10,
        rca: now + rcaOffsetSeconds,
      },
      { expiresIn: '2 days', issuedAt: issuedAtSeconds },
    )
    return { did, sid, deviceToken, sessionToken }
  }

  function expectAttestedSessionLifetime(st: string): void {
    const decoded = jose.decodeJwt(st)
    const lifetimeSeconds = (decoded.exp as number) - (decoded.iat as number)
    expect(lifetimeSeconds).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 1)
    expect(lifetimeSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60 + 1)
  }

  async function readAuthSessionRows(): Promise<Record<string, unknown>[]> {
    const tableDir = path.join(testDir, 'auth_sessions')
    const fileNames = await fs.promises.readdir(tableDir).catch((err: unknown) => {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return []
      throw err
    })

    return (
      await Promise.all(
        fileNames.map(async fileName => {
          const raw = await fs.promises.readFile(path.join(tableDir, fileName), 'utf8')
          return raw
            .trim()
            .split('\n')
            .flatMap(line => (line ? [JSON.parse(line) as Record<string, unknown>] : []))
        }),
      )
    ).flat()
  }

  async function expectAuthSessionEvent(
    did: string,
    sid: string,
    eventType: string,
  ): Promise<void> {
    await flush()
    const rows = await readAuthSessionRows()
    const matchingRows = rows.filter(row => row.device_id === did && row.session_id === sid)
    expect(matchingRows.length).toBeGreaterThanOrEqual(1)
    expect(matchingRows[0]!.event_type).toBe(eventType)
  }

  describe('refreshSessionState', () => {
    it('warm path: issues anon session when session is revoked', async () => {
      const uid = v7()
      const { deviceToken, sessionToken, sid } = await makeWarmPathTokens(uid)
      await revokeSession(sid)
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      expect(result.uid).toBeNull()
      expect(result.st).not.toBe(sessionToken)
      await expectAuthSessionEvent(result.did, result.sid, 'refreshed_anonymous')
    })

    it('warm path: issues anon session when all user sessions were revoked', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(user.id)

      await revokeAllAuthenticatedSessions(user.id)

      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      expect(result.uid).toBeNull()
      expect(result.st).not.toBe(sessionToken)
      await expectAuthSessionEvent(result.did, result.sid, 'refreshed_anonymous')
    }, 20_000)

    it('warm path: applies user-wide revocation cutoff in the combined Valkey check', async () => {
      const uid = v7()
      const cutoffSeconds = Math.floor(Date.now() / 1000) - 30
      const revokedTokens = await makeWarmPathTokens(uid, 3600, undefined, undefined, cutoffSeconds)
      const freshTokens = await makeWarmPathTokens(
        uid,
        3600,
        undefined,
        undefined,
        cutoffSeconds + 1,
      )

      await revokeUserSessionsBefore(uid, cutoffSeconds)

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
      const uid = v7()
      const did = v7()
      const sid = v7()
      const now = Math.floor(Date.now() / 1000)

      await revokeUserSessionsBefore(uid, now)

      const result = await applyHotWarmCold(
        {
          did,
          sid,
          uid,
          sca: now - 10,
          rca: now + 3600,
        },
        did,
        'device-token',
        'session-token',
        getTestPrivateUserById,
      )

      expect(result.uid).toBeNull()
      expect(result.st).not.toBe('session-token')
    })

    it('warm path: re-issues with existing enrichment when not stale and rca not reached', async () => {
      const uid = v7()
      const { deviceToken, sessionToken, sid } = await makeWarmPathTokens(uid, 3600, 'fr')
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      // Same uid + sid, new token with refreshed sca
      expect(result.uid).toBe(uid)
      expect(result.sid).toBe(sid)
      expect(result.st).not.toBe(sessionToken)
      expect(result.session.uil).toBe('fr')
    })

    it('warm path: forces cold path reload when user claims are stale', async () => {
      const uid = v7()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(uid)
      await markJwtStale(uid)
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      // uid not in DB → cold path finds null claims → revoke + anon session
      expect(result.uid).toBeNull()
    })

    it('warm path: preserves dc:attested (30-day st) when re-issuing with existing enrichment', async () => {
      const uid = v7()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(uid, 3600, 'fr', 'attested')
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      expect(result.uid).toBe(uid)
      expect(result.st).not.toBe(sessionToken)
      expect(result.deviceClass).toBe('attested')
      expectAttestedSessionLifetime(result.st)
    })

    it('cold path: preserves dc:attested (30-day st) on the anon fallback when user claims are stale', async () => {
      const uid = v7()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(
        uid,
        3600,
        undefined,
        'attested',
      )
      await markJwtStale(uid)
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      // uid not in DB → cold path finds null claims → revoke + anon session
      expect(result.uid).toBeNull()
      expect(result.deviceClass).toBe('attested')
      expectAttestedSessionLifetime(result.st)
    })

    it('cold path: issues anon session when a real user is suspended', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken } = await makeWarmPathTokens(user.id)
      await markJwtStale(user.id)
      await suspendTestUser(user.id)

      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      // real user found but suspended → revoke + anon session
      expect(result.uid).toBeNull()

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
      })
      expect(result.uid).toBe(user.id)
      expect(result.st).not.toBe(sessionToken)
    }, 20_000)
  })
})
