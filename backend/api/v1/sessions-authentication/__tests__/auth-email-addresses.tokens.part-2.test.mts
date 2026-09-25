import {
  overrideDynamicConfigFieldsForTest,
  deleteDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createRequest, nextTestRequestIp, request } from '@voucha/test-helpers/api/server'
import {
  createUniqueTestEmail,
  invalidateEmailDomainCaches,
  createAppAttestAssertionHeaders,
  TEST_APP_ATTEST_BUNDLE_ID,
  TEST_APP_ATTEST_TEAM_ID,
} from '@voucha/test-helpers'

import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { appAttestationConfig } from '@services/app-attestation'
import { v7 } from 'uuid'

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

describe('Email Address Authentication Routes', () => {
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeEach(async () => {
    vi.clearAllMocks()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })

    const did = v7()
    const sid = v7()
    await createDeviceAndSessionTokens({ did, sid })
    await invalidateEmailDomainCaches()
  }, 30_000)

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  describe('POST /api/v1/auth/email-address/tokens', () => {
    it('does not rate limit distinct credentials', async () => {
      const email1 = createUniqueTestEmail('different-1')
      const email2 = createUniqueTestEmail('different-2')

      // Use fresh tokens for both requests to avoid rate limit contamination from other tests
      const firstTokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7() })
      const secondTokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7() })

      await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', nextTestRequestIp())
        .send({
          emailAddress: email1,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: firstTokens.deviceToken.token,
          st: firstTokens.sessionToken.token,
        })
        .expect(200)

      await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', nextTestRequestIp())
        .send({
          emailAddress: email2,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: secondTokens.deviceToken.token,
          st: secondTokens.sessionToken.token,
        })
        .expect(200)
    })

    it('rejects non-string, non-null ui_locale values', async () => {
      const response = await createRequest()
        .post('/api/v1/auth/email-address/tokens')
        .send({
          emailAddress: createUniqueTestEmail('locale-shape'),
          ui_locale: {},
        })
        .expect(422)

      expect(response.body.message).toContain('Invalid request body')
    })

    it('accepts a null ui_locale', async () => {
      const emailAddress = createUniqueTestEmail('locale-null')
      const tokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7() })
      const response = await createRequest()
        .post('/api/v1/auth/email-address/tokens')
        .send({
          emailAddress,
          ui_locale: null,
          dt: tokens.deviceToken.token,
          st: tokens.sessionToken.token,
        })
        .expect(200)

      expect(response.body.email_address).toBe(emailAddress)
    })

    describe('App Attest bypass', () => {
      beforeEach(() => {
        vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEST_APP_ATTEST_TEAM_ID)
        vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', TEST_APP_ATTEST_BUNDLE_ID)
        overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
        overrideDynamicConfigFieldsForTest(appAttestationConfig, {
          require_attestation_for_bypass: true,
        })
      })

      afterEach(() => {
        deleteDynamicConfigFieldsForTest(
          appAttestationConfig,
          Object.keys(appAttestationConfig.fieldTypes),
        )
      })

      it('creates a login token via a valid App Attest assertion without any Turnstile token', async () => {
        const req = createRequest()
        const emailAddress = createUniqueTestEmail('app-attest')
        // This route has no prior authenticateAs() call, so `ctx.getDeviceTokenData()` (called
        // internally by verifyCaptchaOrAttestation) would otherwise mint a fresh random `did` --
        // an explicit `dt` cookie is required so the request's `did` matches the one the
        // attestation key below is bound to.
        const did = v7()
        const { deviceToken } = await createDeviceAndSessionTokens({ did })
        const headers = await createAppAttestAssertionHeaders({
          did,
          actionTag: 'auth.email-address-tokens',
        })

        const response = await req
          .post('/api/v1/auth/email-address/tokens')
          .set('Cookie', `dt=${deviceToken.token}`)
          .set('x-app-attest-key-id', headers['x-app-attest-key-id'])
          .set('x-app-attest-assertion', headers['x-app-attest-assertion'])
          .set('x-app-attest-challenge-id', headers['x-app-attest-challenge-id'])
          .send({ emailAddress })
          .expect(200)

        expect(response.body.email_address).toContain('app-attest')
      })
    })
  })
})
