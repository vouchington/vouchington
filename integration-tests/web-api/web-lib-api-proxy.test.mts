import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../backend/entrypoints/api/index.mts'
import { listenOnFetchSafeLoopback } from './routes.mts'
import { refreshProxySession, recordProxyReferralAttribution } from '@/lib/api/server/proxy'
import { createTestUser } from '../../backend/test-helpers/index.mts'
import { createDeviceAndSessionTokens } from '../../backend/services/jwt-session/index.mts'
import { mintUUIDv7 } from '../../ts-shared/session-jwt/index.mts'

describe('web/lib/api/server/proxy — integration', () => {
  let backendServer: http.Server
  let backendBaseUrl: string
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl
  }, 15_000)

  afterAll(async () => {
    backendServer.closeAllConnections()
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })

    if (previousApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }
  }, 15_000)

  // ─── server/proxy.ts ─────────────────────────────────────────────────────

  describe('refreshProxySession', () => {
    it('returns a valid session when called with real device and session tokens', async () => {
      const did = mintUUIDv7()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did,
        uid: null,
      })

      const result = await refreshProxySession(
        backendBaseUrl,
        { dt: deviceToken.token, st: sessionToken.token },
        {},
      )

      expect(result).not.toBeNull()
      expect(typeof result!.dte).toBe('number')
      expect(typeof result!.ste).toBe('number')
      expect(typeof result!.secure).toBe('boolean')
    })

    it('returns null when the backend responds with a non-ok status', async () => {
      // The real backend always returns 200 for PATCH /api/v1/session (it creates a
      // fresh anonymous session when tokens are absent or malformed). To exercise the
      // non-ok branch we spin up a minimal server that unconditionally returns 503.
      const errorServer = http.createServer((_req, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Service Unavailable' }))
      })
      const errorOrigin = await listenOnFetchSafeLoopback(errorServer)

      try {
        const result = await refreshProxySession(errorOrigin, {}, {})
        expect(result).toBeNull()
      } finally {
        errorServer.closeAllConnections()
        await new Promise<void>(resolve => errorServer.close(() => resolve()))
      }
    })

    it('throws when the backend URL has an unsupported protocol', async () => {
      const did = mintUUIDv7()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did,
        uid: null,
      })

      await expect(
        refreshProxySession(
          'ftp://example.com',
          { dt: deviceToken.token, st: sessionToken.token },
          {},
        ),
      ).rejects.toThrow('Unsupported backend URL protocol')
    })
  })

  describe('recordProxyReferralAttribution', () => {
    it('records attribution against the real backend and returns a Response', async () => {
      const referrerUser = await createTestUser()
      const did = mintUUIDv7()
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did,
        uid: null,
      })

      const response = await recordProxyReferralAttribution(
        backendBaseUrl,
        {
          referrer: referrerUser!.id,
          landing_url: `https://example.com/test-${randomUUID()}`,
        },
        { dt: deviceToken.token, st: sessionToken.token },
        {},
      )

      expect(response.ok).toBe(true)
    })

    it('throws when the backend URL has an unsupported protocol', async () => {
      await expect(
        recordProxyReferralAttribution(
          'ftp://example.com',
          { referrer: 'user-id', landing_url: 'https://example.com' },
          { dt: 'token', st: 'token' },
          {},
        ),
      ).rejects.toThrow('Unsupported backend URL protocol')
    })
  })
})
