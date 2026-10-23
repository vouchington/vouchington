import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import { verifySessionJwt } from '@ts-shared/session-jwt'
import serverApp from '../../../backend/entrypoints/api/index.mts'
import { recordProxyReferralAttribution } from '@/lib/api/server/proxy'
import {
  createTestUser,
  getSessionReferralAttributionsWithUtm,
} from '../../../backend/test-helpers/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'
import type { CookieHeader } from '../routes-extended.mts'

describe('routes-extended', () => {
  let backendServer: http.Server

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

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
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

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
  }, 15_000)

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
      expect(attributions).toContainEqual(
        expect.objectContaining({ referrer_user_id: referrerUserId }),
      )
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
          referrer_user_id: referrerUserSecondaryId,
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
