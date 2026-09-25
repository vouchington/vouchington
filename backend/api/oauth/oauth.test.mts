import { createHash, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserDirect,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { getOAuthResourceUrl } from '@services/oauth-authorization-server'

const RESOURCE = getOAuthResourceUrl('user')
const SCOPE = 'mcp.user:read mcp.user:write'
let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

describe('OAuth authorization routes', () => {
  beforeEach(() => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })
  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('completes a public-client authorization-code flow with S256 PKCE', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(user)
    const redirectUri = randomRedirectUri()
    const registration = await request
      .post('/register')
      .send({
        client_name: 'OAuth route integration client',
        redirect_uris: [redirectUri],
        scope: SCOPE,
      })
      .expect(201)
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const state = randomBytes(12).toString('base64url')
    const authorization = await request
      .get('/authorize')
      .query({
        client_id: registration.body.client_id,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        resource: RESOURCE,
        response_type: 'code',
        scope: SCOPE,
        state,
      })
      .expect(302)
    const consentLocation = new URL(authorization.headers.location, 'https://voucha.test')
    expect(consentLocation.pathname).toBe('/oauth/consent')
    const requestId = consentLocation.searchParams.get('request_id')
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)

    const consent = await request
      .get(`/api/v1/oauth/authorization-requests/${requestId}`)
      .expect(200)
    expect(consent.body.authorization_request).toMatchObject({
      client_name: 'OAuth route integration client',
      resource: RESOURCE,
      scopes: ['mcp.user:read', 'mcp.user:write'],
    })

    const decision = await request
      .post(`/api/v1/oauth/authorization-requests/${requestId}/decisions`)
      .send({ decision: 'approve' })
      .expect(200)
    const callback = new URL(decision.body.redirect_uri)
    expect(callback.searchParams.get('state')).toBe(state)
    const code = callback.searchParams.get('code')
    expect(code).toMatch(/^voucha_code_/)

    const token = await createRequest()
      .post('/token')
      .type('form')
      .send({
        client_id: registration.body.client_id,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
      .expect(200)
    expect(token.body).toMatchObject({ token_type: 'Bearer', scope: SCOPE, expires_in: 3600 })
    expect(token.headers['cache-control']).toBe('no-store')

    const refreshed = await createRequest()
      .post('/token')
      .type('form')
      .send({
        client_id: registration.body.client_id,
        grant_type: 'refresh_token',
        refresh_token: token.body.refresh_token,
      })
      .expect(200)
    expect(refreshed.body).toMatchObject({ token_type: 'Bearer', scope: SCOPE })

    await createRequest()
      .post('/revoke')
      .type('form')
      .send({ client_id: registration.body.client_id, token: refreshed.body.refresh_token })
      .expect(200)

    await createRequest()
      .post('/token')
      .type('form')
      .send({
        client_id: registration.body.client_id,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
      .expect(400, { error: 'invalid_grant', error_description: 'authorization code is invalid' })
  })

  it('rejects an unregistered authorization request before sign-in', async () => {
    const response = await createRequest()
      .get('/authorize')
      .query({
        client_id: 'untrusted',
        code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
        code_challenge_method: 'S256',
        redirect_uri: 'https://attacker.example/callback',
        resource: RESOURCE,
        response_type: 'code',
        scope: SCOPE,
        state: 'opaque-state',
      })
      .expect(400)
    expect(response.body).toEqual({
      error: 'unauthorized_client',
      error_description: 'client is not registered',
    })
    expect(response.headers.location).toBeUndefined()
  })

  it('routes a valid unauthenticated request through login with a local next path', async () => {
    const redirectUri = randomRedirectUri()
    const registration = await createRequest()
      .post('/register')
      .send({
        client_name: 'Unauthenticated authorization client',
        redirect_uris: [redirectUri],
        scope: SCOPE,
      })
      .expect(201)
    const verifier = randomBytes(32).toString('base64url')
    const response = await createRequest()
      .get('/authorize')
      .query({
        client_id: registration.body.client_id,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        resource: RESOURCE,
        response_type: 'code',
        scope: SCOPE,
        state: randomBytes(12).toString('base64url'),
      })
      .expect(302)
    const location = new URL(response.headers.location, 'https://voucha.test')
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toMatch(/^\/authorize\?/)
  })

  it('rejects authorization and consent mutations from a suspended user', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(user)
    const redirectUri = randomRedirectUri()
    const registration = await request
      .post('/register')
      .send({ client_name: 'Suspended consent client', redirect_uris: [redirectUri], scope: SCOPE })
      .expect(201)
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const authorization = await request
      .get('/authorize')
      .query({
        client_id: registration.body.client_id,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        resource: RESOURCE,
        response_type: 'code',
        scope: SCOPE,
        state: randomBytes(12).toString('base64url'),
      })
      .expect(302)
    const requestId = new URL(
      authorization.headers.location,
      'https://voucha.test',
    ).searchParams.get('request_id')
    if (!requestId) throw new Error('authorization request id was not returned')
    await suspendTestUser(user.id)
    try {
      const consent = await request
        .post(`/api/v1/oauth/authorization-requests/${requestId}/decisions`)
        .send({ decision: 'approve' })
        .expect(403)
      expect(consent.body.code).toBe(ACCOUNT_SUSPENDED)
      const authorize = await request
        .get('/authorize')
        .query({
          client_id: registration.body.client_id,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          redirect_uri: redirectUri,
          resource: RESOURCE,
          response_type: 'code',
          scope: SCOPE,
          state: randomBytes(12).toString('base64url'),
        })
        .expect(403)
      expect(authorize.body.code).toBe(ACCOUNT_SUSPENDED)
    } finally {
      await unsuspendTestUser(user.id)
    }
  })

  it('never redirects an authorization error to an unregistered URI', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(user)
    const registration = await request
      .post('/register')
      .send({
        client_name: 'Redirect boundary client',
        redirect_uris: [randomRedirectUri()],
        scope: SCOPE,
      })
      .expect(201)
    const response = await request
      .get('/authorize')
      .query({
        client_id: registration.body.client_id,
        redirect_uri: 'https://attacker.example/callback',
        response_type: 'not-code',
        state: 'opaque-state',
      })
      .expect(400)
    expect(response.headers.location).toBeUndefined()
    expect(response.body).toMatchObject({ error: 'unsupported_response_type' })
  })

  it('redirects a protocol error only to the registered callback', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(user)
    const redirectUri = randomRedirectUri()
    const registration = await request
      .post('/register')
      .send({
        client_name: 'Registered authorization error client',
        redirect_uris: [redirectUri],
        scope: SCOPE,
      })
      .expect(201)

    const response = await request
      .get('/authorize')
      .query({
        client_id: registration.body.client_id,
        redirect_uri: redirectUri,
        response_type: 'token',
        state: 'registered-error-state',
      })
      .expect(302)

    const location = response.headers.location
    if (!location) throw new Error('authorization error redirect was not returned')
    const callback = new URL(location)
    expect(callback.origin + callback.pathname).toBe(redirectUri)
    expect(callback.searchParams.get('error')).toBe('unsupported_response_type')
    expect(callback.searchParams.get('state')).toBe('registered-error-state')
  })
})

function randomRedirectUri(): string {
  const port = 30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)
  return `http://127.0.0.1:${port}/callback/${randomBytes(6).toString('hex')}`
}
