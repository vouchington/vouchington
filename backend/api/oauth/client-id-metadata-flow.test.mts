import { createHash, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestClientIdMetadataClient } from '@voucha/test-helpers/data-stores/psql/oauth-client-metadata'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  getNativeOAuthClientDocument,
  getOAuthResourceUrl,
  type NativeOAuthClientApp,
} from '@services/oauth-authorization-server'

const RESOURCE = getOAuthResourceUrl('user')
const SCOPE = 'mcp.user:read mcp.user:write'
let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

describe('Client ID Metadata Document authorization routes', () => {
  beforeEach(() => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('completes a cached document flow through consent and token exchange', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(user)
    const clientId = `https://client.example/${randomBytes(12).toString('hex')}/metadata.json`
    const redirectUri = randomRedirectUri()
    await insertTestClientIdMetadataClient({
      clientId,
      clientName: 'Unreviewed document name',
      redirectUris: [redirectUri],
      scopes: SCOPE.split(' '),
    })
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const authorization = await request
      .get('/authorize')
      .query({
        client_id: clientId,
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

    const consent = await request
      .get(`/api/v1/oauth/authorization-requests/${requestId}`)
      .expect(200)
    expect(consent.body.authorization_request).toMatchObject({
      client_hostname: 'client.example',
      client_name: 'client.example',
    })
    const decision = await request
      .post(`/api/v1/oauth/authorization-requests/${requestId}/decisions`)
      .send({ decision: 'approve' })
      .expect(200)
    const code = new URL(decision.body.redirect_uri).searchParams.get('code')
    if (!code) throw new Error('authorization code was not returned')

    await createRequest()
      .post('/token')
      .type('form')
      .send({
        client_id: clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
      .expect(200)
  })

  it.each([
    ['ios', null],
    ['windows', '127.0.0.1'],
    ['windows', '[::1]'],
  ] as const)(
    'authorizes a native %s client with %s loopback, consent, exact code redirect and MCP',
    async (app: NativeOAuthClientApp, loopbackHost) => {
      const user = await createTestUserDirect()
      const request = createRequest()
      await request.authenticateAs(user)
      const document = getNativeOAuthClientDocument(app)
      const registeredRedirect = document.redirect_uris[loopbackHost === '[::1]' ? 1 : 0]!
      const redirectUri = loopbackHost
        ? registeredRedirect.replace(
            loopbackHost,
            `${loopbackHost}:${30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)}`,
          )
        : registeredRedirect
      const verifier = randomBytes(32).toString('base64url')
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      const authorization = await request
        .get('/authorize')
        .query({
          client_id: document.client_id,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          redirect_uri: redirectUri,
          resource: RESOURCE,
          response_type: 'code',
          scope: document.scope,
          state: randomBytes(12).toString('base64url'),
        })
        .expect(302)
      const requestId = new URL(
        authorization.headers.location,
        document.client_id,
      ).searchParams.get('request_id')
      if (!requestId) throw new Error('native authorization request id was not returned')

      const consent = await request
        .get(`/api/v1/oauth/authorization-requests/${requestId}`)
        .expect(200)
      expect(consent.body.authorization_request.client_name).toBe(document.client_name)
      expect(consent.body.authorization_request.scopes).toEqual(['mcp.user:read', 'mcp.user:write'])
      const errorRedirect = await request
        .get('/authorize')
        .query({
          client_id: document.client_id,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          redirect_uri: redirectUri,
          resource: RESOURCE,
          response_type: 'code',
          scope: 'unknown:scope',
          state: 'error-state',
        })
        .expect(302)
      const errorCallback = new URL(errorRedirect.headers.location)
      expect(`${errorCallback.origin}${errorCallback.pathname}`).toBe(redirectUri)
      expect(errorCallback.searchParams.get('error')).toBe('invalid_scope')
      const decision = await request
        .post(`/api/v1/oauth/authorization-requests/${requestId}/decisions`)
        .send({ decision: 'approve' })
        .expect(200)
      const callback = new URL(decision.body.redirect_uri)
      expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri)
      const code = callback.searchParams.get('code')
      if (!code) throw new Error('native authorization code was not returned')

      const wrongRedirectUri = loopbackHost ? registeredRedirect : `${redirectUri}?wrong=1`
      await createRequest()
        .post('/token')
        .type('form')
        .send({
          client_id: document.client_id,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: wrongRedirectUri,
        })
        .expect(400)
        .expect(({ body }) => expect(body.error).toBe('invalid_grant'))
      const token = await createRequest()
        .post('/token')
        .type('form')
        .send({
          client_id: document.client_id,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        })
        .expect(200)
      const mcp = await createRequest()
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${token.body.access_token}`)
        .set('Content-Type', 'application/json')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
        .expect(200)
      expect(mcp.body.result.tools.length).toBeGreaterThan(0)
      const repeat = await request
        .get('/authorize')
        .query({
          client_id: document.client_id,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          redirect_uri: redirectUri,
          resource: RESOURCE,
          response_type: 'code',
          scope: document.scope,
          state: randomBytes(12).toString('base64url'),
        })
        .expect(302)
      const repeatRequestId = new URL(repeat.headers.location, document.client_id).searchParams.get(
        'request_id',
      )
      expect(repeatRequestId).toBeTruthy()
      expect(repeatRequestId).not.toBe(requestId)
      await request.get(`/api/v1/oauth/authorization-requests/${repeatRequestId}`).expect(200)
    },
  )
})

function randomRedirectUri(): string {
  const port = 30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)
  return `http://127.0.0.1:${port}/callback/${randomBytes(6).toString('hex')}`
}
