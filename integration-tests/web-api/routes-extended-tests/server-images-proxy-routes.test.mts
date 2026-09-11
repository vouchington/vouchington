import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import { verifySessionJwt } from '@ts-shared/session-jwt'
import serverApp from '../../../backend/entrypoints/api/index.mts'
import { refreshProxySession, recordProxyReferralAttribution } from '@/lib/api/server/proxy'
import {
  createTestUser,
  getSessionReferralAttributionsWithUtm,
} from '../../../backend/test-helpers/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'
import type { CookieHeader } from '../routes-extended.mts'

describe('routes-extended', () => {
  let backendServer: http.Server

  let capturedHeaders: http.IncomingHttpHeaders | undefined

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

  let previousFetch: typeof globalThis.fetch

  let hadWindow: boolean

  let previousWindow: unknown

  let backendBaseUrl: string

  let userCookieHeader: CookieHeader

  let userDeviceToken: string

  let userSessionToken: string

  let sessionId: string

  let referrerUserId: string

  let referrerUserSecondaryId: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    // A passive observer on the raw socket: records the headers the backend actually
    // received, independent of whether any backend route reacts to them. This is how
    // "the header was really forwarded" gets asserted below, since this harness builds
    // its server from backend/entrypoints/api/index.mts's unwrapped app — the real
    // request-client-info listener (and its enforcement path) only exists in
    // backend/entrypoints/api/serve.mts, which nothing here goes through.
    backendServer.on('request', req => {
      capturedHeaders = req.headers
    })
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    previousFetch = globalThis.fetch
    hadWindow = Object.hasOwn(globalThis, 'window')
    previousWindow = (globalThis as { window?: unknown }).window
    globalThis.fetch = previousFetch

    const user = await createTestUser()
    userCookieHeader = await createWebApiTestCookieHeader(user.id)

    // Extract raw token values from cookie header for proxy tests
    const cookieString = userCookieHeader.Cookie ?? ''
    const dtMatch = cookieString.match(/dt=([^;]+)/)
    const stMatch = cookieString.match(/st=([^;]+)/)
    userDeviceToken = dtMatch?.[1] ?? ''
    userSessionToken = stMatch?.[1] ?? ''

    const sessionPayload = await verifySessionJwt(userSessionToken)
    sessionId = sessionPayload!.sid

    // Real users (not the synthetic 'test-referrer' strings) so createSessionReferralAttribution's
    // getReferrerId can actually resolve a referrer instead of silently no-oping on a 404.
    const referrerUser = await createTestUser()
    referrerUserId = referrerUser.id
    const referrerUserSecondary = await createTestUser()
    referrerUserSecondaryId = referrerUserSecondary.id
  }, 20_000)

  afterAll(async () => {
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

    globalThis.fetch = previousFetch
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = previousWindow
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }, 15_000)

  describe('proxy — refreshProxySession', () => {
    it('returns session data when body is empty (anonymous session creation)', async () => {
      const result = await refreshProxySession(backendBaseUrl, {}, {})
      expect(result).toMatchObject({
        dte: expect.any(Number),
        ste: expect.any(Number),
        secure: expect.any(Boolean),
      })
    })

    it('returns session data when valid tokens are provided', async () => {
      const result = await refreshProxySession(
        backendBaseUrl,
        { dt: userDeviceToken, st: userSessionToken },
        {},
      )
      expect(result).toMatchObject({
        dte: expect.any(Number),
        ste: expect.any(Number),
        secure: expect.any(Boolean),
      })
    })

    it('passes forwardedIpHeaders through without error', async () => {
      const result = await refreshProxySession(
        backendBaseUrl,
        { dt: userDeviceToken, st: userSessionToken },
        { 'x-forwarded-for': '198.51.100.7' },
      )
      // `typeof null === 'object'`, so the old either/or check accepted any non-primitive,
      // including a broken result. Adding an extra forwarded-IP header must not degrade
      // a valid-token refresh to a null session.
      expect(result).toMatchObject({
        dte: expect.any(Number),
        ste: expect.any(Number),
        secure: expect.any(Boolean),
      })
    })

    it('actually forwards the IP header to the backend, not just tolerates it', async () => {
      // This harness builds its server from backend/entrypoints/api/index.mts's unwrapped
      // app, which never runs the request-client-info listener/enforcement path (that only
      // exists in backend/entrypoints/api/serve.mts) — so backend-side enforcement can't be
      // used to prove the header made it through. Instead, observe the raw request the
      // backend socket actually receives: a dropped forwardedIpHeaders would leave this
      // undefined, while a real forward makes it match exactly.
      capturedHeaders = undefined
      const result = await refreshProxySession(
        backendBaseUrl,
        { dt: userDeviceToken, st: userSessionToken },
        { 'x-forwarded-for': '198.51.100.7' },
      )
      expect(result).not.toBeNull()
      expect(capturedHeaders?.['x-forwarded-for']).toBe('198.51.100.7')
    })

    it('throws on unsupported backend URL protocol', async () => {
      await expect(refreshProxySession('ftp://backend.example.com', {}, {})).rejects.toThrow(
        'Unsupported backend URL protocol: ftp:',
      )
    })
  })

  describe('proxy — recordProxyReferralAttribution', () => {
    it('persists the referral attribution when the referrer exists', async () => {
      expect(userDeviceToken).toBeTruthy()
      expect(userSessionToken).toBeTruthy()

      const response = await recordProxyReferralAttribution(
        backendBaseUrl,
        {
          referrer: referrerUserId,
          landing_url: `${backendBaseUrl}/`,
        },
        { dt: userDeviceToken, st: userSessionToken },
        {},
      )
      // fetch() always resolves to a Response even on a 4xx/5xx, so `toBeInstanceOf(Response)`
      // alone can't distinguish success from a rejected/broken request.
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })

      // The route returns the same {ok:true} whether the attribution was recorded or the
      // referrer was silently rejected (createSessionReferralAttribution's getReferrerId
      // returns null for an unknown referrer, and the route swallows the resulting 404 to
      // prevent enumeration) — the old synthetic 'test-referrer' string hit exactly that
      // silent no-op path. Using a real user id and reading the row back is what actually
      // proves the attribution was persisted.
      const attributions = await getSessionReferralAttributionsWithUtm(sessionId)
      expect(attributions).toContainEqual(expect.objectContaining({ referrer_id: referrerUserId }))
    })

    it('persists utm fields on the referral attribution', async () => {
      expect(userDeviceToken).toBeTruthy()
      expect(userSessionToken).toBeTruthy()

      const response = await recordProxyReferralAttribution(
        backendBaseUrl,
        {
          referrer: referrerUserSecondaryId,
          landing_url: `${backendBaseUrl}/`,
          utm: {
            utm_source: 'test',
            utm_medium: 'email',
            utm_campaign: 'welcome',
            utm_content: null,
          },
        },
        { dt: userDeviceToken, st: userSessionToken },
        {},
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })

      const attributions = await getSessionReferralAttributionsWithUtm(sessionId)
      expect(attributions).toContainEqual(
        expect.objectContaining({
          referrer_id: referrerUserSecondaryId,
          utm_source: 'test',
          utm_medium: 'email',
          utm_campaign: 'welcome',
          utm_content: null,
        }),
      )
    })

    it('throws on unsupported backend URL protocol', async () => {
      await expect(
        recordProxyReferralAttribution(
          'ftp://backend.example.com',
          { referrer: 'r', landing_url: 'https://example.com' },
          { dt: 'dt', st: 'st' },
          {},
        ),
      ).rejects.toThrow('Unsupported backend URL protocol: ftp:')
    })
  })
})
