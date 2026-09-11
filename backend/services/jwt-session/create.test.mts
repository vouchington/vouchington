import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v7 } from 'uuid'
import * as jose from 'jose'
import { flush } from '@data-stores/analytics/backend-local'
import { createTestUser } from '@voucha/test-helpers'
import { countTestWebUserAgents } from '../../test-helpers/entities/user-sessions.mts'
import { createDeviceAndSessionTokens, createSessionToken } from './create.mts'
import { revokeUserSessionsBefore } from './session-revocation-keys.mts'
import { upsertAuthenticatedSession } from './user-sessions.mts'
import { verifyDeviceAndSessionTokens } from './verify.mts'

describe('create', () => {
  let testDir: string
  let originalAnalyticsLocalDir: string | undefined
  let originalAnalyticsBackend: string | undefined

  beforeAll(async () => {
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jwt-session-create-test-'))
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

  describe('createSessionToken', () => {
    it('rejects invalid device id values', async () => {
      await expect(createSessionToken({ did: 'not-a-uuid' })).rejects.toThrow('Invalid UUIDv7')
    })

    it('rejects invalid session id values', async () => {
      await expect(createSessionToken({ did: v7(), sid: 'not-a-uuid' })).rejects.toThrow(
        'Invalid UUIDv7',
      )
    })

    it('rejects invalid user id values', async () => {
      await expect(createSessionToken({ did: v7(), uid: 'not-a-uuid' })).rejects.toThrow(
        'Invalid UUIDv7',
      )
    })

    it('emits the requested auth session event type', async () => {
      const did = v7()
      const sid = v7()
      const uid = v7()

      await createSessionToken({
        did,
        sid,
        uid,
        eventType: 'refreshed_authenticated',
      })
      await flush()

      const tableDir = path.join(testDir, 'auth_sessions')
      const fileNames = await fs.promises.readdir(tableDir)
      const rows = (
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
      const matchingRows = rows.filter(row => row.device_id === did && row.session_id === sid)
      expect(matchingRows.length).toBeGreaterThanOrEqual(1)
      expect(matchingRows[0]!.event_type).toBe('refreshed_authenticated')
      expect(matchingRows[0]!.authenticated).toBe(true)
      expect(matchingRows[0]!.user_id).toBe(uid)
    })

    it('mints a 30-day token when deviceClass is attested', async () => {
      const did = v7()
      const sid = v7()

      const { token } = await createSessionToken({ did, sid, deviceClass: 'attested' })

      const decoded = jose.decodeJwt(token)
      const lifetimeSeconds = (decoded.exp as number) - (decoded.iat as number)
      expect(lifetimeSeconds).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 1)
      expect(lifetimeSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60 + 1)
    })

    it('mints a 2-day token when deviceClass is omitted', async () => {
      const did = v7()
      const sid = v7()

      const { token } = await createSessionToken({ did, sid })

      const decoded = jose.decodeJwt(token)
      const lifetimeSeconds = (decoded.exp as number) - (decoded.iat as number)
      expect(lifetimeSeconds).toBeGreaterThanOrEqual(2 * 24 * 60 * 60 - 1)
      expect(lifetimeSeconds).toBeLessThanOrEqual(2 * 24 * 60 * 60 + 1)
    })

    it('mints authenticated replacement tokens after the user revocation cutoff', async () => {
      const did = v7()
      const sid = v7()
      const uid = v7()
      const cutoffSeconds = Math.floor(Date.now() / 1000) + 60
      await revokeUserSessionsBefore(uid, cutoffSeconds)

      const { token } = await createSessionToken({ did, sid, uid })

      expect(jose.decodeJwt(token).iat).toBe(cutoffSeconds + 1)
    })

    it('verifies authenticated replacement tokens minted after the user revocation cutoff', async () => {
      const did = v7()
      const uid = v7()
      const cutoffSeconds = Math.floor(Date.now() / 1000) + 60
      await revokeUserSessionsBefore(uid, cutoffSeconds)

      const result = await createDeviceAndSessionTokens({ did, uid })

      await expect(
        verifyDeviceAndSessionTokens({
          deviceToken: result.deviceToken.token,
          sessionToken: result.sessionToken.token,
        }),
      ).resolves.not.toBe(false)
      expect(jose.decodeJwt(result.sessionToken.token).iat).toBe(cutoffSeconds + 1)
    })

    it('reuses generic web user-agent rows across sessions', async () => {
      const user = await createTestUser()
      const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0'
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

      await upsertAuthenticatedSession(user.id, {
        sid: v7(),
        deviceId: v7(),
        expiresAt,
        userAgent,
      })
      await upsertAuthenticatedSession(user.id, {
        sid: v7(),
        deviceId: v7(),
        expiresAt,
        userAgent,
      })

      await expect(countTestWebUserAgents(userAgent)).resolves.toBe(1)
    })
  })
})
