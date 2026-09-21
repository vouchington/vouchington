import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'

const SCOPE = 'mcp.user:read mcp.user:write'
let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

describe('OAuth token and revocation protocol parsing', () => {
  beforeEach(() => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })
  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('rejects duplicate form parameters and unsupported client_secret_post', async () => {
    const registration = await registerPublicClient('Form parsing client')
    await createRequest()
      .post('/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(
        `client_id=${registration.client_id}&client_id=duplicate&grant_type=refresh_token&refresh_token=opaque`,
      )
      .expect(400, {
        error: 'invalid_request',
        error_description: 'client_id must not be repeated',
      })
    await createRequest()
      .post('/token')
      .type('form')
      .send({
        client_id: registration.client_id,
        client_secret: 'unsupported',
        grant_type: 'refresh_token',
        refresh_token: 'opaque',
      })
      .expect(401, {
        error: 'invalid_client',
        error_description: 'client_secret_post is not supported',
      })
  })

  it('handles Basic case-insensitively and authenticates before grant validation', async () => {
    const registration = await createRequest()
      .post('/register')
      .send({
        client_name: 'Confidential parsing client',
        redirect_uris: [randomRedirectUri()],
        scope: SCOPE,
        token_endpoint_auth_method: 'client_secret_basic',
      })
      .expect(201)
    const validCredentials = Buffer.from(
      `${registration.body.client_id}:${registration.body.client_secret}`,
    ).toString('base64')
    const invalidCredentials = Buffer.from(`${registration.body.client_id}:wrong-secret`).toString(
      'base64',
    )

    await createRequest()
      .post('/token')
      .set('Authorization', `basic ${validCredentials}`)
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'opaque' })
      .expect(400, { error: 'invalid_grant', error_description: 'refresh token is invalid' })
    await createRequest()
      .post('/token')
      .set('Authorization', `Basic ${invalidCredentials}`)
      .type('form')
      .send({
        code: 'opaque',
        code_verifier: 'short',
        grant_type: 'authorization_code',
        redirect_uri: randomRedirectUri(),
      })
      .expect(401, {
        error: 'invalid_client',
        error_description: 'client authentication failed',
      })
    await createRequest()
      .post('/token')
      .set('Authorization', `Basic ${invalidCredentials}`)
      .type('form')
      .send({ grant_type: 'urn:example:unsupported' })
      .expect(401, {
        error: 'invalid_client',
        error_description: 'client authentication failed',
      })
    await createRequest()
      .post('/token')
      .set('Authorization', `Basic ${validCredentials}`)
      .type('form')
      .send({ grant_type: 'urn:example:unsupported' })
      .expect(400, {
        error: 'unsupported_grant_type',
        error_description: 'grant_type is not supported',
      })
  })

  it('rejects malformed consent request IDs before querying PostgreSQL', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(user)
    const read = await request.get('/api/v1/oauth/authorization-requests/not-a-uuid').expect(422)
    expect(read.body).toMatchObject({ message: 'Invalid id' })
    const decision = await request
      .post('/api/v1/oauth/authorization-requests/not-a-uuid/decisions')
      .send({ decision: 'deny' })
      .expect(422)
    expect(decision.body).toMatchObject({ message: 'Invalid id' })
  })

  it('rejects malformed HTTP Basic client credentials', async () => {
    const response = await createRequest()
      .post('/token')
      .set('Authorization', 'Basic not-base64!')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'opaque' })
      .expect(401)
    expect(response.headers['www-authenticate']).toBe('Basic realm="token"')
    expect(response.body).toEqual({
      error: 'invalid_client',
      error_description: 'client authentication failed',
    })
  })

  it('rejects HTTP Basic authentication for a public client', async () => {
    const registration = await registerPublicClient('Public authentication boundary client')
    const credentials = Buffer.from(`${registration.client_id}:`).toString('base64')
    const response = await createRequest()
      .post('/token')
      .set('Authorization', `Basic ${credentials}`)
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'opaque' })
      .expect(401)
    expect(response.body).toEqual({
      error: 'invalid_client',
      error_description: 'public client sent a secret',
    })
  })

  it('requires a registered client for token revocation', async () => {
    const response = await createRequest()
      .post('/revoke')
      .type('form')
      .send({ client_id: 'unknown-client', token: 'opaque' })
      .expect(401)
    expect(response.headers['www-authenticate']).toBe('Basic realm="token"')
    expect(response.body).toEqual({
      error: 'invalid_client',
      error_description: 'client authentication failed',
    })
  })
})

async function registerPublicClient(clientName: string): Promise<{ client_id: string }> {
  const response = await createRequest()
    .post('/register')
    .send({ client_name: clientName, redirect_uris: [randomRedirectUri()], scope: SCOPE })
    .expect(201)
  return response.body as { client_id: string }
}

function randomRedirectUri(): string {
  const port = 30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)
  return `http://127.0.0.1:${port}/callback/${randomBytes(6).toString('hex')}`
}
