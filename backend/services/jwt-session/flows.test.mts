import { expectAuthSessionEvent } from '@voucha/test-helpers/auth-session-events'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v7 } from 'uuid'
import { isUuidv7 as isUUIDv7 } from '@vouchington/session-jwt'
import { createTestUser, getTestPrivateUserById } from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from './create.mts'
import { refreshSessionState } from './flows.mts'
import {
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '../../test-helpers/services/jwt-session/index.mts'

describe('flows', () => {
  let testDir: string
  let originalAnalyticsLocalDir: string | undefined
  let originalAnalyticsBackend: string | undefined

  beforeAll(async () => {
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jwt-session-flows-test-'))
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

  describe('refreshSessionState', () => {
    it('records valid anonymous sessions as refreshed anonymous events', async () => {
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did: v7() })
      const did = deviceToken.payload.did
      const sid = sessionToken.payload.sid

      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken: deviceToken.token,
        sessionToken: sessionToken.token,
      })

      expect(result.uid).toBeNull()
      expect(result.sid).toBe(sid)
      expect(result.st).toBe(sessionToken.token)
      await expectAuthSessionEvent(testDir, did, sid, 'refreshed_anonymous')
    })

    it('records first-time anonymous fallback as a created event', async () => {
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
      })

      expect(result.uid).toBeNull()
      await expectAuthSessionEvent(testDir, result.did, result.sid, 'created')
    })

    it('rotates an authenticated web session using its registered authority', async () => {
      const user = await createTestUser()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did: v7(),
        uid: user.id,
        deviceContext: {
          user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0',
        },
      })
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken: deviceToken.token,
        sessionToken: sessionToken.token,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0',
      })
      expect(result.dt).not.toBe(deviceToken.token)
      expect(result.uid).toBe(user.id)
      expect(result.sid).toBe(sessionToken.payload.sid)
    })

    it('hot path: rejects signed UUIDv4 anonymous ids before returning tokens', async () => {
      const did = legacyUuidV4()
      const sid = legacyUuidV4()
      const deviceToken = await signLegacyDeviceJwt({ did })
      const sessionToken = await signLegacySessionJwt({ did, sid, uid: null })

      const result = await refreshSessionState({
        deviceToken,
        sessionToken,
        fetchUser: getTestPrivateUserById,
      })

      expect(isUUIDv7(result.did)).toBe(true)
      expect(isUUIDv7(result.sid)).toBe(true)
      expect(result.did).not.toBe(did)
      expect(result.sid).not.toBe(sid)
      expect(result.dt).not.toBe(deviceToken)
      expect(result.st).not.toBe(sessionToken)
      expect(result.uid).toBeNull()
    })

    it('hot path: rejects signed UUIDv4 authenticated ids before returning tokens', async () => {
      const did = legacyUuidV4()
      const sid = legacyUuidV4()
      const uid = v7()
      const now = Math.floor(Date.now() / 1000)
      const deviceToken = await signLegacyDeviceJwt({ did })
      const sessionToken = await signLegacySessionJwt({
        did,
        sid,
        uid,
        sca: now + 3600,
        rca: now + 3600,
      })

      const result = await refreshSessionState({
        deviceToken,
        sessionToken,
        fetchUser: getTestPrivateUserById,
      })

      expect(isUUIDv7(result.did)).toBe(true)
      expect(isUUIDv7(result.sid)).toBe(true)
      expect(result.did).not.toBe(did)
      expect(result.sid).not.toBe(sid)
      expect(result.dt).not.toBe(deviceToken)
      expect(result.st).not.toBe(sessionToken)
      expect(result.uid).toBeNull()
    })
  })
})
