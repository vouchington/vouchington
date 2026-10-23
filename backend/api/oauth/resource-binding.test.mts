import { createHash, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  createOwnedOAuthApp,
  getOAuthIssuer,
  getOAuthResourceUrl,
} from '@services/oauth-authorization-server'
import {
  createTestApprovedOAuthAuthorization,
  randomTestOAuthRedirectUri,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

type AuthorizeOptions = { resource: string; scope: string; ownerUserId?: string }
type TestRequest = ReturnType<typeof createRequest>

let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

// Starts authorization for a dynamic or owner-managed app and returns the local error response.
async function authorize(request: TestRequest, { resource, scope, ownerUserId }: AuthorizeOptions) {
  const redirectUri = randomTestOAuthRedirectUri()
  const client = ownerUserId
    ? (
        await createOwnedOAuthApp(ownerUserId, {
          client_name: 'Owner-managed resource app',
          redirect_uris: [redirectUri],
          scopes: scope.split(' '),
        })
      ).oauth_app
    : (
        await request
          .post('/register')
          .send({
            client_name: 'Resource binding client',
            redirect_uris: [redirectUri],
            scope,
          })
          .expect(201)
      ).body
  const state = randomBytes(12).toString('base64url')
  const response = await request.get('/authorize').query({
    client_id: client.client_id,
    code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    resource,
    response_type: 'code',
    scope,
    state,
  })
  return response
}

describe('OAuth resource binding routes', () => {
  beforeEach(() => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })
  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it.each([
    ['an unsupported path', () => `${getOAuthIssuer()}/api/v1/users`],
    ['an external origin', () => 'https://attacker.example/api/v1/mcp'],
  ])('keeps %s authorization errors local', async (_case, resource) => {
    const response = await authorize(createRequest(), {
      resource: resource(),
      scope: 'mcp.user:read',
    })
    expect(response.status).toBe(400)
    expect(response.headers.location).toBeUndefined()
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Authorization unavailable')
  })

  it.each([
    ['admin', 'mcp.admin:read', false],
    ['legal', 'copyright-notices:read', false],
    ['admin', 'mcp.admin:read', true],
    ['legal', 'copyright-notices:read', true],
  ] as const)(
    'denies owned apps the %s resource (administrator=%s)',
    async (audience, scope, administrator) => {
      const user = await createTestUserDirect({ administrator })
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await authorize(request, {
        resource: getOAuthResourceUrl(audience),
        scope,
        ownerUserId: user.id,
      })
      expect(response.status).toBe(403)
      expect(response.headers.location).toBeUndefined()
      expect(response.headers['content-type']).toContain('text/html')
    },
  )

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
