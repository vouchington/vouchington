import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v7 } from 'uuid'
import { isUUIDv7, signDeviceJwt, signSessionJwt } from '@ts-shared/session-jwt'
import { flush } from '@data-stores/analytics/backend-local'
import { getTestPrivateUserById } from '@voucha/test-helpers'
import { refreshSessionState } from './flows.mts'
import { legacyUuidV4, signLegacyDeviceJwt, signLegacySessionJwt } from './test-helpers/index.mts'

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
    it('records valid anonymous sessions as refreshed anonymous events', async () => {
      const did = v7()
      const sid = v7()
      const deviceToken = await signDeviceJwt({ did }, { expiresIn: '30 days' })
      const sessionToken = await signSessionJwt({ did, sid, uid: null }, { expiresIn: '2 days' })

      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })

      expect(result.uid).toBeNull()
      expect(result.sid).toBe(sid)
      expect(result.st).toBe(sessionToken)
      await expectAuthSessionEvent(did, sid, 'refreshed_anonymous')
    })

    it('records first-time anonymous fallback as a created event', async () => {
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
      })

      expect(result.uid).toBeNull()
      await expectAuthSessionEvent(result.did, result.sid, 'created')
    })

    it('hot path: returns existing session token unchanged when sca not yet expired', async () => {
      const did = v7()
      const sid = v7()
      const uid = v7()
      const now = Math.floor(Date.now() / 1000)
      const deviceToken = await signDeviceJwt({ did }, { expiresIn: '30 days' })
      const sessionToken = await signSessionJwt(
        { did, sid, uid, sca: now + 3600, rca: now + 3600 },
        { expiresIn: '2 days' },
      )
      const result = await refreshSessionState({
        fetchUser: getTestPrivateUserById,
        deviceToken,
        sessionToken,
      })
      expect(result.st).toBe(sessionToken)
      expect(result.uid).toBe(uid)
      expect(result.sid).toBe(sid)
    })

    it('hot path: rotates legacy anonymous ids before returning tokens', async () => {
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

    it('hot path: rotates legacy authenticated ids before returning tokens', async () => {
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
      expect(result.uid).toBe(uid)
    })
  })
})
