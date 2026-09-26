import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createRequest, request } from '@voucha/test-helpers/api/server'
import {
  createUniqueTestEmail,
  overrideDynamicConfigFieldsForTest,
  invalidateEmailDomainCaches,
  createTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'

import { addDomainsToEmailBloomFilter } from '@services/urls-domains-blacklist'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { v7 } from 'uuid'

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

function testForwardedIp(index: number): string {
  return `198.51.100.${index}`
}

describe('Email Address Authentication Routes', () => {
  let deviceToken: string
  let sessionToken: string
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeEach(async () => {
    vi.clearAllMocks()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })

    const did = v7()
    const sid = v7()
    const tokens = await createDeviceAndSessionTokens({ did, sid })
    deviceToken = tokens.deviceToken.token
    sessionToken = tokens.sessionToken.token
    await invalidateEmailDomainCaches()
  }, 30_000)

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  describe('POST /api/v1/auth/email-address/tokens', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('returns 422 with user-friendly message for disposable email domain', async () => {
      await createTestBlacklistSource({
        type: 'email',
        name: 'test-email-blacklist',
        url: 'https://example.com/email-blacklist.txt',
      })

      const blockDomain = `blocked-disposable-${Date.now()}.com`
      await insertTestDomainBlacklist(blockDomain, 'test-email-blacklist')
      await addDomainsToEmailBloomFilter([blockDomain])

      const response = await createRequest()
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(31))
        .send({
          emailAddress: `user@${blockDomain}`,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(422)

      expect(response.body.message).toBe(
        'Please use a permanent email address. Disposable email providers are not supported.',
      )
    }, 30_000)

    it('creates login tokens for emailAddress and email_address fields', async () => {
      const req = createRequest()
      const camelEmail = createUniqueTestEmail('camel')
      const snakeEmail = createUniqueTestEmail('snake')

      const camelCase = await req
        .post('/api/v1/auth/email-address/tokens')
        .send({
          emailAddress: camelEmail,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)
      expect(camelCase.body.email_address).toBe(camelEmail)

      const snakeCase = await req
        .post('/api/v1/auth/email-address/tokens')
        .send({
          email_address: snakeEmail,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)
      expect(snakeCase.body.email_address).toBe(snakeEmail)
    })

    it('creates login token without session tokens', async () => {
      const req = createRequest()
      const emailAddress = createUniqueTestEmail('no-tokens')

      const noTokens = await req
        .post('/api/v1/auth/email-address/tokens')
        .send({
          emailAddress,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
        })
        .expect(200)
      expect(noTokens.body.email_address).toBe(emailAddress)
    })

    it('rejects missing emailAddress, wrong content-type, and malformed JSON', async () => {
      const req = createRequest()
      const missingEmail = await req
        .post('/api/v1/auth/email-address/tokens')
        .send({ dt: deviceToken, st: sessionToken })
        .expect(422)
      expect(missingEmail.body.message).toContain('emailAddress is required')

      await req.post('/api/v1/auth/email-address/tokens').send('not json').expect(415)
      const malformed = await req
        .post('/api/v1/auth/email-address/tokens')
        .set('Content-Type', 'application/json')
        .send('{not valid json')
        .expect(400)
      expect(malformed.body.message).toBe('Invalid JSON')
    })

    it('treats a literal JSON null body as empty instead of crashing', async () => {
      const response = await createRequest()
        .post('/api/v1/auth/email-address/tokens')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)

      expect(response.body.message).toContain('emailAddress is required')
    })

    it('returns fake 200 with email address echoed back when honeypot is filled', async () => {
      const req = createRequest()
      const emailAddress = createUniqueTestEmail('hp-token')

      const response = await req
        .post('/api/v1/auth/email-address/tokens')
        .send({
          emailAddress,
          hp_website: 'http://spam.com',
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      expect(response.body.email_address).toContain('hp-token')
    })

    it('rate limits normalized email addresses after 4 requests', async () => {
      const baseEmail = createUniqueTestEmail('normalize')

      await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(21))
        .send({
          emailAddress: baseEmail,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(22))
        .send({
          emailAddress: baseEmail.toUpperCase(),
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(23))
        .send({
          emailAddress: `  ${baseEmail}  `,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(24))
        .send({
          emailAddress: baseEmail,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(200)

      const limited = await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(25))
        .send({
          emailAddress: baseEmail.toUpperCase(),
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(429)

      expect(limited.body.message).toContain('Too many requests')
    })

    it('rate limits by device after 4 requests', async () => {
      for (let i = 1; i <= 4; i += 1) {
        await request
          .post('/api/v1/auth/email-address/tokens')
          .set('x-forwarded-for', testForwardedIp(i))
          .send({
            emailAddress: createUniqueTestEmail(`device-${i}`),
            cf_turnstile_response: TEST_CAPTCHA_TOKEN,
            dt: deviceToken,
            st: sessionToken,
          })
          .expect(200)
      }

      const limited = await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(5))
        .send({
          emailAddress: createUniqueTestEmail('device-5'),
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: deviceToken,
          st: sessionToken,
        })
        .expect(429)

      expect(limited.body.message).toContain('Too many requests')
    })

    it('rate limits by session after 4 requests', async () => {
      const sid = v7()
      const sessionTokensList = await Promise.all(
        Array.from({ length: 5 }, () => createDeviceAndSessionTokens({ did: v7(), sid })),
      )

      for (let i = 0; i < 4; i += 1) {
        await request
          .post('/api/v1/auth/email-address/tokens')
          .set('x-forwarded-for', testForwardedIp(i + 11))
          .send({
            emailAddress: createUniqueTestEmail(`session-${i + 1}`),
            cf_turnstile_response: TEST_CAPTCHA_TOKEN,
            dt: sessionTokensList[i]!.deviceToken.token,
            st: sessionTokensList[i]!.sessionToken.token,
          })
          .expect(200)
      }

      const limited = await request
        .post('/api/v1/auth/email-address/tokens')
        .set('x-forwarded-for', testForwardedIp(15))
        .send({
          emailAddress: createUniqueTestEmail('session-5'),
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          dt: sessionTokensList[4]!.deviceToken.token,
          st: sessionTokensList[4]!.sessionToken.token,
        })
        .expect(429)

      expect(limited.body.message).toContain('Too many requests')
    })
  })
})
