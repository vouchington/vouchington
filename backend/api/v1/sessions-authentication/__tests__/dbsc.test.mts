import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createRequest, createNativeRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createEmailAddressLoginToken } from '@services/users/authentication'
import { verifySessionJwt } from '@ts-shared/session-jwt'

const origin = 'https://dbsc.example'
const userAgent = 'Synthetic browser/1.0'

function browser() {
  return createRequest()
    .set('User-Agent', userAgent)
    .set('x-forwarded-proto', 'https')
    .set('x-forwarded-host', 'dbsc.example')
}
async function login(request = browser()) {
  const user = await createTestUserDirect({ withEmail: true })
  const { token } = await createEmailAddressLoginToken(user.email_address!)
  const response = await request
    .post('/api/v1/auth/email-address/login')
    .send({ email_address: user.email_address, token })
    .expect(200)
  return { request, response }
}
async function signProof(nonce: string, registration = false) {
  const key = await generateKeyPair('ES256')
  const jwk = await exportJWK(key.publicKey)
  const sign = async (challenge: string, includeKey = false) =>
    `"${await new SignJWT({ jti: challenge })
      .setProtectedHeader({ alg: 'ES256', typ: 'dbsc+jwt', ...(includeKey && { jwk }) })
      .sign(key.privateKey)}"`
  return { initial: await sign(nonce, registration), sign }
}
function cookieTokens(headers: Record<string, unknown>): string[] {
  return (headers['set-cookie'] as string[]).map(value => value.split(';', 1)[0]!)
}

describe('browser device-bound session protocol', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_ORIGIN', origin)
    vi.stubEnv('CF_WORKER_SECRET', 'synthetic-worker-secret-for-dbsc-tests')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('advertises only on HTTPS web credential completion and uses cookie-only registration and refresh', async () => {
    const { request, response } = await login()
    const registrationHeader = response.headers['secure-session-registration'] as string
    expect(registrationHeader).toMatch(
      /^\(ES256\);path="\/api\/v1\/auth\/device-bound-sessions";challenge="/,
    )
    const nonce = /challenge="([A-Za-z0-9_-]+)"/u.exec(registrationHeader)![1]!
    const proof = await signProof(nonce, true)
    const cookies = cookieTokens(response.headers)
    const registered = await request
      .post('/api/v1/auth/device-bound-sessions')
      .set('Cookie', cookies.join('; '))
      .set('Secure-Session-Response', proof.initial)
      .expect(200)
    expect(registered.body).toEqual({
      session_identifier: response.body.sid,
      refresh_url: `${origin}/api/v1/auth/device-bound-sessions/refreshes`,
      scope: { origin, include_site: false },
      credentials: [
        { type: 'cookie', name: 'st', attributes: 'Path=/; Secure; HttpOnly; SameSite=Lax' },
      ],
    })
    expect(registered.headers['cache-control']).toBe('no-store')
    const boundCookies = cookieTokens(registered.headers)
    const st = boundCookies.find(cookie => cookie.startsWith('st='))!.slice(3)
    expect((await verifySessionJwt(st))?.dbsc).toBe(true)
    expect(registered.body).not.toHaveProperty('dt')
    expect(registered.body).not.toHaveProperty('st')
    // The pre-registration dt also requires proof after the authoritative transition.
    await request.patch('/api/v1/session').set('Cookie', cookies.join('; ')).send({}).expect(403)
    const dt = boundCookies.find(cookie => cookie.startsWith('dt='))!
    const challenge = await request
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', dt)
      .set('Sec-Secure-Session-Id', `"${response.body.sid}"`)
      .expect(403)
    const challengeHeader = challenge.headers['secure-session-challenge'] as string
    expect(challengeHeader).toMatch(new RegExp(`;id="${response.body.sid}"$`))
    const refreshNonce = /^"([A-Za-z0-9_-]+)"/u.exec(challengeHeader)![1]!
    const refreshProof = await proof.sign(refreshNonce)
    const refreshed = await request
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', dt)
      .set('Sec-Secure-Session-Id', `"${response.body.sid}"`)
      .set('Secure-Session-Response', refreshProof)
      .expect(200)
    expect(refreshed.headers['set-cookie']).toHaveLength(2)
    expect(refreshed.body.session_identifier).toBe(response.body.sid)
    expect(refreshed.body).not.toHaveProperty('session')
    const replay = await request
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', dt)
      .set('Sec-Secure-Session-Id', `"${response.body.sid}"`)
      .set('Secure-Session-Response', refreshProof)
      .expect(400)
    expect(replay.headers['secure-session-challenge']).toBeUndefined()
  })

  it('returns terminal errors without a challenge for missing identifiers and unconfigured origins', async () => {
    const { request, response } = await login()
    const cookies = cookieTokens(response.headers).join('; ')
    const missing = await request
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', cookies)
      .expect(400)
    expect(missing.headers['secure-session-challenge']).toBeUndefined()
    const wrongOrigin = await browser()
      .set('x-forwarded-host', 'other.example')
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', cookies)
      .set('Sec-Secure-Session-Id', '"unknown"')
      .expect(401)
    expect(wrongOrigin.headers['secure-session-challenge']).toBeUndefined()
  })

  it('does not advertise registration for native login or an HTTP public origin', async () => {
    const native = await login(createNativeRequest())
    expect(native.response.headers['secure-session-registration']).toBeUndefined()
    expect(native.response.body.dt).not.toHaveProperty('registrationEligible')
    vi.stubEnv('SITE_ORIGIN', 'http://dbsc.example')
    const web = await login(browser().set('x-forwarded-proto', 'http'))
    expect(web.response.headers['secure-session-registration']).toBeUndefined()
    expect(web.response.body).not.toHaveProperty('dt')
  })

  it('rejects a registration request at an origin different from the configured HTTPS site', async () => {
    const { response } = await login()
    const nonce = /challenge="([A-Za-z0-9_-]+)"/u.exec(
      response.headers['secure-session-registration'] as string,
    )![1]!
    const proof = await signProof(nonce, true)
    await browser()
      .set('x-forwarded-host', 'other.example')
      .post('/api/v1/auth/device-bound-sessions')
      .set('Cookie', cookieTokens(response.headers).join('; '))
      .set('Secure-Session-Response', proof.initial)
      .expect(401)
  })
})
