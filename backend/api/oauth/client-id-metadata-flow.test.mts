import { createHash, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestClientIdMetadataClient } from '@voucha/test-helpers/data-stores/psql/oauth-client-metadata'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { getOAuthResourceUrl } from '@services/oauth-authorization-server'

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
})

function randomRedirectUri(): string {
  const port = 30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)
  return `http://127.0.0.1:${port}/callback/${randomBytes(6).toString('hex')}`
}
