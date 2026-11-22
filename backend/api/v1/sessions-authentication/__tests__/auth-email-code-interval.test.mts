import { randomInt } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  createUniqueTestEmail,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { TEST_CAPTCHA_TOKEN } from '@voucha/test-helpers/captcha/test-captcha-token'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import { emails } from '@queues/emails/queues'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { emailAuthLimitsConfig } from '@services/users/email-auth-limits-config'

const loginTokens = '/api/v1/auth/email-address/tokens'
const reAuthTokens = '/api/v1/auth/mfa/re-auth/email/tokens'

type TestRequest = ReturnType<typeof createRequest>

function randomTestIp(): string {
  return `198.51.100.${randomInt(1, 255)}`
}

function postLogin(req: TestRequest, ip: string, emailAddress: string) {
  return req
    .post(loginTokens)
    .set('x-forwarded-for', ip)
    .send({ emailAddress, cf_turnstile_response: TEST_CAPTCHA_TOKEN })
}

function enableInterval(seconds = 60) {
  overrideDynamicConfigFieldsForTest(emailAuthLimitsConfig, {
    code_request_min_interval_seconds: seconds,
  })
}

describe('email code request spacing', () => {
  installEmailDomainDnsMock()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuses a second login code for the same email inside the interval', async () => {
    enableInterval()
    const emailAddress = createUniqueTestEmail('interval')
    const ip = randomTestIp()
    const enqueue = vi.spyOn(emails, 'add')
    const req = createRequest()

    const first = await postLogin(req, ip, emailAddress).expect(200)
    expect(first.body).toEqual({ email_address: emailAddress, resend_after_seconds: 60 })
    expect(enqueue).toHaveBeenCalledTimes(1)

    const second = await postLogin(req, ip, emailAddress).expect(429)
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(second.headers['retry-after'])).toBeLessThanOrEqual(60)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('does not charge a refused request, so the interval is not extended', async () => {
    enableInterval()
    const emailAddress = createUniqueTestEmail('no-extend')
    const ip = randomTestIp()
    const req = createRequest()
    await postLogin(req, ip, emailAddress).expect(200)
    await postLogin(req, ip, emailAddress).expect(429)
    await postLogin(req, ip, emailAddress).expect(429)

    const intervalLimiter = new RateLimiter({
      prefix: 'email-address-login-code-interval',
      ttlSeconds: 60,
    })
    await expect(intervalLimiter.get([emailAddress])).resolves.toEqual([1])
  })

  it('does not slow a different email', async () => {
    enableInterval()
    const ip = randomTestIp()
    const req = createRequest()
    await postLogin(req, ip, createUniqueTestEmail('first')).expect(200)
    await postLogin(req, ip, createUniqueTestEmail('second')).expect(200)
  })

  it('turns spacing off when the interval is zero', async () => {
    enableInterval(0)
    const emailAddress = createUniqueTestEmail('off')
    const ip = randomTestIp()
    const req = createRequest()
    const first = await postLogin(req, ip, emailAddress).expect(200)
    expect(first.body.resend_after_seconds).toBe(0)
    await postLogin(req, ip, emailAddress).expect(200)
  })

  it('spaces re-authentication codes per session', async () => {
    enableInterval()
    const enqueue = vi.spyOn(emails, 'add')
    const [user, otherUser] = await Promise.all([createTestUser(), createTestUser()])
    const ip = randomTestIp()
    const req = createRequest()
    await req.authenticateAs(user)

    const first = await req.post(reAuthTokens).set('x-forwarded-for', ip).expect(200)
    expect(first.body.resend_after_seconds).toBe(60)
    const sentAfterFirst = enqueue.mock.calls.length

    const second = await req.post(reAuthTokens).set('x-forwarded-for', ip).expect(429)
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0)
    expect(enqueue).toHaveBeenCalledTimes(sentAfterFirst)

    const otherReq = createRequest()
    await otherReq.authenticateAs(otherUser)
    await otherReq.post(reAuthTokens).set('x-forwarded-for', randomTestIp()).expect(200)
  })
})
