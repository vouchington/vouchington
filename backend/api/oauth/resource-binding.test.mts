import { createHash, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { getOAuthIssuer, getOAuthResourceUrl } from '@services/oauth-authorization-server'
import {
  createTestApprovedOAuthAuthorization,
  randomTestOAuthRedirectUri,
} from '@services/oauth-authorization-server/test-support'

type AuthorizeOptions = { resource: string; scope: string }
type TestRequest = ReturnType<typeof createRequest>

let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

// Registers a client for `scope` and starts /authorize, returning the redirect for inspection.
async function authorize(request: TestRequest, { resource, scope }: AuthorizeOptions) {
  const redirectUri = randomTestOAuthRedirectUri()
  const registration = await request
    .post('/register')
    .send({ client_name: 'Resource binding client', redirect_uris: [redirectUri], scope })
    .expect(201)
  const state = randomBytes(12).toString('base64url')
  const response = await request
    .get('/authorize')
    .query({
      client_id: registration.body.client_id,
      code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      resource,
      response_type: 'code',
      scope,
      state,
    })
    .expect(302)
  return { location: new URL(response.headers.location, getOAuthIssuer()), redirectUri, state }
}

describe('OAuth resource binding routes', () => {
  beforeEach(() => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })
  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('redirects an unsupported resource back to the client as invalid_target with iss', async () => {
    const { location, redirectUri, state } = await authorize(createRequest(), {
      resource: `${getOAuthIssuer()}/api/v1/users`,
      scope: 'mcp.user:read',
    })

    expect(`${location.origin}${location.pathname}`).toBe(redirectUri)
    expect(Object.fromEntries(location.searchParams)).toEqual({
      error: 'invalid_target',
      error_description: expect.any(String),
      iss: getOAuthIssuer(),
      state,
    })
  })

  it('denies a non-administrator access to the admin resource', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUserDirect())

    const { location, state } = await authorize(request, {
      resource: getOAuthResourceUrl('admin'),
      scope: 'mcp.admin:read',
    })

    expect(location.searchParams.get('error')).toBe('access_denied')
    expect(location.searchParams.get('iss')).toBe(getOAuthIssuer())
    expect(location.searchParams.get('state')).toBe(state)
  })

  it('lets an administrator approve the admin resource with iss on the callback', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUserDirect({ administrator: true }))

    const { location, state } = await authorize(request, {
      resource: getOAuthResourceUrl('admin'),
      scope: 'mcp.admin:read',
    })
    expect(location.pathname).toBe('/oauth/consent')
    const decision = await request
      .post(
        `/api/v1/oauth/authorization-requests/${location.searchParams.get('request_id')}/decisions`,
      )
      .send({ decision: 'approve' })
      .expect(200)

    const callback = new URL(decision.body.redirect_uri)
    expect(callback.searchParams.get('code')).toMatch(/^voucha_code_/)
    expect(callback.searchParams.get('iss')).toBe(getOAuthIssuer())
    expect(callback.searchParams.get('state')).toBe(state)
  })

  it('accepts a token request resource only when it names the bound resource', async () => {
    const approved = await createTestApprovedOAuthAuthorization(await createTestUserDirect())
    const exchange = (resource: string) =>
      createRequest().post('/token').type('form').send({
        client_id: approved.client.client_id,
        code: approved.code,
        code_verifier: approved.verifier,
        grant_type: 'authorization_code',
        redirect_uri: approved.redirectUri,
        resource,
      })

    const mismatch = await exchange(getOAuthResourceUrl('admin')).expect(400)
    expect(mismatch.body).toMatchObject({ error: 'invalid_target' })
    const token = await exchange(getOAuthResourceUrl('user')).expect(200)
    expect(token.body).toMatchObject({
      token_type: 'Bearer',
      scope: 'mcp.user:read mcp.user:write',
    })
  })
})
