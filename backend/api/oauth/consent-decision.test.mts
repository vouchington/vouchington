import { createHash, randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { useRouteRateLimitConfigSnapshot } from '@voucha/test-helpers/api/route-rate-limit-config-snapshot'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { randomTestOAuthRedirectUri } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { getOAuthResourceUrl } from '@services/oauth-authorization-server'

describe('OAuth consent decision input', () => {
  useRouteRateLimitConfigSnapshot()

  beforeEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  it('rejects an invalid decision without consuming the pending authorization', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUserDirect())
    const redirectUri = randomTestOAuthRedirectUri()
    const registration = await request
      .post('/register')
      .send({
        client_name: 'Consent decision validation client',
        redirect_uris: [redirectUri],
        scope: 'mcp.user:read',
      })
      .expect(201)
    const verifier = randomBytes(32).toString('base64url')
    const authorization = await request
      .get('/authorize')
      .query({
        client_id: registration.body.client_id,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        resource: getOAuthResourceUrl('user'),
        response_type: 'code',
        scope: 'mcp.user:read',
        state: randomBytes(12).toString('base64url'),
      })
      .expect(302)
    const requestId = new URL(
      authorization.headers.location,
      'https://voucha.test',
    ).searchParams.get('request_id')
    if (!requestId) throw new Error('Authorization request ID was not returned')
    const route = `/api/v1/oauth/authorization-requests/${requestId}`

    const invalid = await request.post(`${route}/decisions`).send({ decision: 'later' }).expect(422)
    expect(invalid.body).toMatchObject({ message: 'Invalid decision' })
    await request.get(route).expect(200)

    const approval = await request
      .post(`${route}/decisions`)
      .send({ decision: 'approve' })
      .expect(200)
    expect(new URL(approval.body.redirect_uri).searchParams.get('code')).toMatch(/^voucha_code_/)
  })
})
