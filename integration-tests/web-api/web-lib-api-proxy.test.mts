import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../backend/entrypoints/api/index.mts'
import { createWebApiTestServer, listenOnFetchSafeLoopback } from './routes.mts'
import { recordProxyReferralAttribution } from '@/lib/api/server/proxy'
import { createTestUser } from '../../backend/test-helpers/index.mts'
import { createDeviceAndSessionTokens } from '../../backend/services/jwt-session/index.mts'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'

describe('web/lib/api/server/proxy — integration', () => {
  let backendServer: http.Server
  let backendBaseUrl: string
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = createWebApiTestServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl
  })

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
