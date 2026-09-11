import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { trackAuthSessionEvent } from './auth-session.mts'

describe('auth-session', () => {
  let testDir: string
  let originalAnalyticsLocalDir: string | undefined
  let originalAnalyticsBackend: string | undefined

  beforeAll(async () => {
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-auth-session-test-'))
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

  describe('trackAuthSessionEvent', () => {
    it('records an anonymous session creation', async () => {
      const did = crypto.randomUUID()
      const sid = crypto.randomUUID()
      trackAuthSessionEvent({ did, sid, uid: null, eventType: 'created' })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM auth_sessions WHERE device_id = '${did}' AND session_id = '${sid}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.event_type).toBe('created')
      expect(String(rows[0]!.authenticated)).toBe('false')
      expect(rows[0]!.user_id ?? null).toBeNull()
    })

    it('records an authenticated session creation', async () => {
      const did = crypto.randomUUID()
      const sid = crypto.randomUUID()
      const uid = crypto.randomUUID()
      trackAuthSessionEvent({ did, sid, uid, eventType: 'created' })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM auth_sessions WHERE device_id = '${did}' AND session_id = '${sid}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.event_type).toBe('created')
      expect(String(rows[0]!.authenticated)).toBe('true')
      expect(rows[0]!.user_id).toBe(uid)
    })

    it('records an anonymous session refresh', async () => {
      const did = crypto.randomUUID()
      const sid = crypto.randomUUID()
      trackAuthSessionEvent({ did, sid, uid: null, eventType: 'refreshed_anonymous' })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM auth_sessions WHERE device_id = '${did}' AND session_id = '${sid}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.event_type).toBe('refreshed_anonymous')
      expect(String(rows[0]!.authenticated)).toBe('false')
      expect(rows[0]!.user_id ?? null).toBeNull()
    })

    it('records an authenticated session refresh', async () => {
      const did = crypto.randomUUID()
      const sid = crypto.randomUUID()
      const uid = crypto.randomUUID()
      trackAuthSessionEvent({ did, sid, uid, eventType: 'refreshed_authenticated' })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM auth_sessions WHERE device_id = '${did}' AND session_id = '${sid}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.event_type).toBe('refreshed_authenticated')
      expect(String(rows[0]!.authenticated)).toBe('true')
      expect(rows[0]!.user_id).toBe(uid)
    })

    it('defaults the analytics environment when NODE_ENV is unset', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      delete process.env.NODE_ENV
      const did = crypto.randomUUID()
      const sid = crypto.randomUUID()

      try {
        trackAuthSessionEvent({ did, sid, uid: null, eventType: 'created' })
        await flush()
      } finally {
        if (originalNodeEnv === undefined) {
          delete process.env.NODE_ENV
        } else {
          process.env.NODE_ENV = originalNodeEnv
        }
      }

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM auth_sessions WHERE device_id = '${did}' AND session_id = '${sid}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.env).toBe('development')
    })
  })
})
