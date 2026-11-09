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
import {
  randomTestOAuthRedirectUri,
  registerTestMetadataClient,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

describe('moderator staff OAuth authorization', () => {
  beforeEach(() => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('admits moderator staff to the admin resource and rejects the suspended account at ingress', async () => {
    const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
    const request = createRequest()
    await request.authenticateAs(moderator)
    const redirectUri = randomTestOAuthRedirectUri()
    const client = await registerTestMetadataClient({
      client_name: 'Moderator admin resource client',
      redirect_uris: [redirectUri],
      scope: 'moderation:read',
      token_endpoint_auth_method: 'none',
    })
    const verifier = randomBytes(32).toString('base64url')
    const query = {
      client_id: client.client_id,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      resource: getOAuthResourceUrl('admin'),
      response_type: 'code',
      scope: 'moderation:read',
      state: randomBytes(12).toString('base64url'),
    }

    const admitted = await request.get('/authorize').query(query).expect(302)
    expect(new URL(admitted.headers.location, 'https://voucha.test').pathname).toBe(
      '/oauth/consent',
    )

    await suspendTestUser(moderator.id)
    try {
      const rejected = await request
        .get('/authorize')
        .query({ ...query, state: randomBytes(12).toString('base64url') })
        .expect(403)
      expect(rejected.body.code).toBe(ACCOUNT_SUSPENDED)
    } finally {
      await unsuspendTestUser(moderator.id)
    }
  })
})
