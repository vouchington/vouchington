import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createNativeRequest } from '@voucha/test-helpers/native-api-request'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createEmailAddressLoginToken } from '@services/users/authentication'
import { signSessionJwt, verifySessionJwt } from '@ts-shared/session-jwt'
import { COOKIE_OPTIONS } from '@modules/api-utils'
import { readSessionDeviceAuthority } from '@services/jwt-session/device-authority'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import requestContracts from '../../../../../api-fixtures/v1/request-contracts.json' with { type: 'json' }

const origin = 'https://dbsc.example'
const userAgent = 'Synthetic browser/1.0'
const dbscResponseContracts = new RuntimeRequestValidatorRegistry({
  version: 1,
  source: 'checked-in-request-contracts',
  components: requestContracts.components,
  operations: {
    'POST:/api/v1/auth/device-bound-sessions': {
      body: requestContracts.responses['POST:/api/v1/auth/device-bound-sessions'],
    },
    'POST:/api/v1/auth/device-bound-sessions/refreshes': {
      body: requestContracts.responses['POST:/api/v1/auth/device-bound-sessions/refreshes'],
    },
  },
})

function browser() {
  return createRequest()
    .set('User-Agent', userAgent)
    .set('Origin', origin)
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
  return { request, response, user }
}
async function signProof(nonce: string, registration = false) {
  const key = await generateKeyPair('ES256')
  const jwk = await exportJWK(key.publicKey)
  const sign = async (challenge: string, includeKey = false) =>
    new SignJWT({ jti: challenge })
      .setProtectedHeader({ alg: 'ES256', typ: 'dbsc+jwt', ...(includeKey && { jwk }) })
      .sign(key.privateKey)
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
    expect(
      dbscResponseContracts.validateAuthenticated('POST:/api/v1/auth/device-bound-sessions', {
        body: registered.body,
      }),
    ).toBeNull()
    expect(registered.body).toMatchObject({
      session_identifier: response.body.sid,
      refresh_url: `${origin}/api/v1/auth/device-bound-sessions/refreshes`,
      scope: { origin, include_site: false },
      credentials: [{ type: 'cookie', name: 'st' }],
    })
    expect(registered.body.credentials[0].attributes).toContain('Path=/')
    expect(registered.body.credentials[0].attributes).toContain('HttpOnly')
    expect(registered.body.credentials[0].attributes.includes('Secure')).toBe(COOKIE_OPTIONS.secure)
    expect(registered.body.scope.scope_specification).toEqual(
      expect.arrayContaining([
        { type: 'exclude', path: '/login' },
        { type: 'exclude', path: '/session-renewal' },
        { type: 'exclude', path: '/api/v1/auth/logout' },
      ]),
    )
    expect(JSON.stringify(registered.body.scope)).not.toContain('*')
    expect(registered.headers['cache-control']).toBe('no-store')
    const boundCookies = cookieTokens(registered.headers)
    const st = boundCookies.find(cookie => cookie.startsWith('st='))!.slice(3)
    expect((await verifySessionJwt(st))?.client).toBe('web')
    expect(registered.body).not.toHaveProperty('dt')
    expect(registered.body).not.toHaveProperty('st')
    const dt = boundCookies.find(cookie => cookie.startsWith('dt='))!
    const challenge = await request
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', dt)
      .set('Sec-Secure-Session-Id', response.body.sid)
      .expect(403)
    const challengeHeader = challenge.headers['secure-session-challenge'] as string
    expect(challengeHeader).toMatch(new RegExp(`;id="${response.body.sid}"$`))
    const refreshNonce = /^"([A-Za-z0-9_-]+)"/u.exec(challengeHeader)![1]!
    const refreshProof = await proof.sign(refreshNonce)
    const refreshed = await request
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', dt)
      .set('Sec-Secure-Session-Id', response.body.sid)
      .set('Secure-Session-Response', refreshProof)
      .expect(200)
    expect(
      dbscResponseContracts.validateAuthenticated(
        'POST:/api/v1/auth/device-bound-sessions/refreshes',
        { body: refreshed.body },
      ),
    ).toBeNull()
    expect(refreshed.headers['set-cookie']).toHaveLength(2)
    expect(refreshed.body.session_identifier).toBe(response.body.sid)
    expect(refreshed.body).not.toHaveProperty('session')
    const currentDt = cookieTokens(refreshed.headers).find(cookie => cookie.startsWith('dt='))!
    const renewedChallenge = await browser()
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', currentDt)
      .set('Sec-Secure-Session-Id', response.body.sid)
      .set('Secure-Session-Response', refreshProof)
      .expect(403)
    expect(renewedChallenge.body.code).toBe('DBSC_PROOF_REQUIRED')
    const nextNonce = /^"([A-Za-z0-9_-]+)"/u.exec(
      renewedChallenge.headers['secure-session-challenge'],
    )![1]!
    expect(nextNonce).not.toBe(refreshNonce)
    await browser()
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', currentDt)
      .set('Sec-Secure-Session-Id', response.body.sid)
      .set('Secure-Session-Response', await proof.sign(nextNonce))
      .expect(200)
    // A fresh agent preserves the deliberately old DT instead of attaching its updated cookie jar.
    const replay = await browser()
      .post('/api/v1/auth/device-bound-sessions/refreshes')
      .set('Cookie', dt)
      .set('Sec-Secure-Session-Id', response.body.sid)
      .set('Secure-Session-Response', refreshProof)
      .expect(401)
    expect(replay.headers['secure-session-challenge']).toBeUndefined()
  })

  it('rejects ordinary bound refresh without key proof and preserves durable authority', async () => {
    const { request, response, user } = await login()
    const nonce = /challenge="([A-Za-z0-9_-]+)"/u.exec(
      response.headers['secure-session-registration'],
    )![1]!
    const proof = await signProof(nonce, true)
    const registered = await request
      .post('/api/v1/auth/device-bound-sessions')
      .set('Cookie', cookieTokens(response.headers).join('; '))
      .set('Secure-Session-Response', proof.initial)
      .expect(200)
    const before = await readSessionDeviceAuthority(response.body.sid)
    const rejected = await request
      .patch('/api/v1/session')
      .set('Cookie', cookieTokens(registered.headers).join('; '))
      .send({})
      .expect(403)
    expect(rejected.body.code).toBe('DBSC_PROOF_REQUIRED')
    const now = Math.floor(Date.now() / 1000)
    const expiredSession = await signSessionJwt(
      { did: response.body.did, sid: response.body.sid, uid: user.id },
      { issuedAt: now - 601, expiresIn: now - 1 },
    )
    const boundDt = cookieTokens(registered.headers).find(cookie => cookie.startsWith('dt='))!
    const expired = await browser()
      .patch('/api/v1/session')
      .set('Cookie', `${boundDt}; st=${expiredSession}`)
      .send({})
      .expect(403)
    expect(expired.body.code).toBe('DBSC_PROOF_REQUIRED')
    expect(await readSessionDeviceAuthority(response.body.sid)).toMatchObject({
      device_token_digest: before!.device_token_digest,
      device_bound_session_binding: before!.device_bound_session_binding,
      revoked_at: null,
    })
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

  it('keeps login working without DBSC advertisement when the configured site origin is malformed', async () => {
    vi.stubEnv('SITE_ORIGIN', 'not a URL')
    const { response } = await login()
    expect(response.headers['secure-session-registration']).toBeUndefined()
    expect(response.body).not.toHaveProperty('dt')
    expect(response.body).not.toHaveProperty('st')
    expect(response.headers['set-cookie']).toHaveLength(2)
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

  it.each(['logout', 'reset'] as const)('terminates Chrome binding on %s', async mode => {
    const { request, response } = await login()
    const nonce = /challenge="([A-Za-z0-9_-]+)"/u.exec(
      response.headers['secure-session-registration'] as string,
    )![1]!
    const proof = await signProof(nonce, true)
    const registered = await request
      .post('/api/v1/auth/device-bound-sessions')
      .set('Cookie', cookieTokens(response.headers).join('; '))
      .unset('Origin')
      .unset('Sec-Fetch-Site')
      .set('Secure-Session-Response', proof.initial)
      .expect(200)
    const call =
      mode === 'logout' ? request.post('/api/v1/auth/logout') : request.delete('/api/v1/session')
    const ended = await call
      .set('Cookie', cookieTokens(registered.headers).join('; '))
      .send({})
      .expect(mode === 'logout' ? 204 : 200)
    expect(ended.headers['clear-site-data']).toBe('"cookies"')
    expect((await readSessionDeviceAuthority(response.body.sid))!.revoked_at).toBeInstanceOf(Date)
  })
})
