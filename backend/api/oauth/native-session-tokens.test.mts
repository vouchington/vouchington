import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { softDeleteUser } from '@voucha/test-helpers/entities/users'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { createAppAttestRequestHeaders } from '@voucha/test-helpers/app-attestation-fabricator'
import {
  TEST_APP_ATTEST_BUNDLE_ID,
  TEST_APP_ATTEST_TEAM_ID,
} from '@voucha/test-helpers/app-attestation'
import { getTestNativeSessionMints } from '@voucha/test-helpers/entities/oauth-authorization-server-events'
import { expireTestUserSession } from '@voucha/test-helpers/entities/user-sessions'
import { appAttestationConfig } from '@services/app-attestation'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { createDeviceAndSessionTokens, revokeAuthenticatedSession } from '@services/jwt-session'
import {
  getOAuthResourceUrl,
  listUserOAuthGrants,
  revokeUserOAuthGrant,
} from '@services/oauth-authorization-server'
import { validateOAuthAccessToken } from '@services/oauth-authorization-server/access-tokens'
import { getProfile } from '@services/my/profile'

const PATH = '/api/v1/oauth/native-session-tokens'
const BODY = { client_app: 'ios' }

async function sessionCookies(authOrigin: 'web' | 'native') {
  const user = await createTestUser()
  const tokens = await createDeviceAndSessionTokens({
    did: v7(),
    uid: user.id,
    authOrigin,
  })
  return {
    user,
    did: tokens.deviceToken.payload.did,
    sid: tokens.sessionToken.payload.sid,
    cookies: [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`],
  }
}

function mint(cookies: string[], clientApp: 'ios' | 'macos' | 'windows' = 'ios') {
  return createRequest()
    .post(PATH)
    .set('Cookie', cookies)
    .set('x-voucha-native-mcp-mint', '1')
    .send({ client_app: clientApp })
}

describe('native session MCP token mint', () => {
  let oldRouteConfig: ReturnType<typeof routeRateLimitConfig.getFields>
  let oldAttestationConfig: ReturnType<typeof appAttestationConfig.getFields>

  beforeEach(() => {
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEST_APP_ATTEST_TEAM_ID)
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', TEST_APP_ATTEST_BUNDLE_ID)
    oldRouteConfig = routeRateLimitConfig.getFields()
    oldAttestationConfig = appAttestationConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      request_signing_mode: 'off',
      allow_unattested_native_mcp_mint: true,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, oldRouteConfig)
    overrideDynamicConfigFieldsForTest(appAttestationConfig, oldAttestationConfig)
  })

  it('mints a member MCP token with no refresh credential and keeps grant revocation final', async () => {
    const { user, sid, cookies } = await sessionCookies('native')
    const response = await mint(cookies).expect(200)
    expect(response.body).toMatchObject({
      access_token: expect.stringMatching(/^voucha_access_/),
      token_type: 'Bearer',
      scope: 'mcp.user:read mcp.user:write',
      resource: getOAuthResourceUrl('user'),
    })
    expect(response.body.expires_in).toBeGreaterThan(0)
    expect(response.body.expires_in).toBeLessThanOrEqual(3600)
    expect(response.body).not.toHaveProperty('refresh_token')
    expect(await validateOAuthAccessToken(response.body.access_token, 'user')).toMatchObject({
      user_id: user.id,
      resource: getOAuthResourceUrl('user'),
    })
    await expect(validateOAuthAccessToken(response.body.access_token, 'admin')).resolves.toBeNull()

    const grants = await listUserOAuthGrants(user.id, { limit: 10 })
    const grant = grants.results.find(row => row.session_id === sid)
    expect(grant).toMatchObject({ session_id: sid, attestation_status: 'unattested' })
    const repeated = await mint(cookies).expect(200)
    expect(repeated.body.access_token).not.toBe(response.body.access_token)
    const repeatedGrants = await listUserOAuthGrants(user.id, { limit: 10 })
    expect(repeatedGrants.results.filter(row => row.session_id === sid)).toHaveLength(1)
    expect(await getTestNativeSessionMints(sid)).toEqual([
      expect.objectContaining({
        user_id: user.id,
        grant_id: grant!.id,
        attestation_status: 'unattested',
      }),
      expect.objectContaining({
        user_id: user.id,
        grant_id: grant!.id,
        attestation_status: 'unattested',
      }),
    ])
    expect(await revokeUserOAuthGrant(user.id, grant!.id)).toBe(true)
    await expect(validateOAuthAccessToken(response.body.access_token, 'user')).resolves.toBeNull()
    await expect(validateOAuthAccessToken(repeated.body.access_token, 'user')).resolves.toBeNull()
    await mint(cookies).expect(403)
  })

  it('rejects web sessions, browser headers and missing custom header', async () => {
    const web = await sessionCookies('web')
    await mint(web.cookies).expect(403)
    const native = await sessionCookies('native')
    await mint(native.cookies).set('Origin', 'https://voucha.ai').expect(403)
    await mint(native.cookies).set('Sec-Fetch-Site', 'same-origin').expect(403)
    await createRequest().post(PATH).set('Cookie', native.cookies).send(BODY).expect(403)
  })

  it('binds each session to its first native client and keeps revocation final across client names', async () => {
    const first = await sessionCookies('native')
    await mint(first.cookies, 'ios').expect(200)
    await mint(first.cookies, 'windows').expect(403)

    const secondTokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: first.user.id,
      authOrigin: 'native',
    })
    const secondCookies = [
      `dt=${secondTokens.deviceToken.token}`,
      `st=${secondTokens.sessionToken.token}`,
    ]
    await mint(secondCookies, 'windows').expect(200)

    const grants = await listUserOAuthGrants(first.user.id, { limit: 10 })
    const firstGrant = grants.results.find(row => row.session_id === first.sid)
    expect(firstGrant).toBeDefined()
    expect(await revokeUserOAuthGrant(first.user.id, firstGrant!.id)).toBe(true)
    await mint(first.cookies, 'ios').expect(403)
    await mint(first.cookies, 'windows').expect(403)
    await mint(secondCookies, 'windows').expect(200)
  })

  it('requires App Attest even in global off mode without spending user quota on rejection', async () => {
    const native = await sessionCookies('native')
    const body = JSON.stringify(BODY)
    const headers = await createAppAttestRequestHeaders({
      did: native.did,
      method: 'POST',
      path: PATH,
      body,
    })
    const limiter = new RateLimiter({ prefix: 'native-session-mcp-mint', ttlSeconds: 60 })
    for (let seed = 0; seed < 28; seed += 1)
      await limiter.addAndCheck([`user:${native.user.id}`], 30)
    await mint(native.cookies).expect(403)
    const request = createRequest()
      .post(PATH)
      .set('Cookie', native.cookies)
      .set('Content-Type', 'application/json')
      .set('x-voucha-native-mcp-mint', '1')
    for (const [name, value] of Object.entries(headers)) request.set(name, value)
    const response = await request.send(body).expect(200)
    const grants = await listUserOAuthGrants(native.user.id, { limit: 10 })
    expect(grants.results.find(row => row.session_id === native.sid)).toMatchObject({
      attestation_status: 'attested',
    })
    expect(await getTestNativeSessionMints(native.sid)).toEqual([
      expect.objectContaining({ attestation_status: 'attested' }),
    ])
    expect(response.body).not.toHaveProperty('refresh_token')
  })

  it('rejects an unattested device when the global mint setting is off', async () => {
    const native = await sessionCookies('native')
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      allow_unattested_native_mcp_mint: false,
    })
    await mint(native.cookies).expect(403)
  })

  it('enforces distinct per-session and per-user mint limits', async () => {
    const sessionLimited = await sessionCookies('native')
    const limiter = new RateLimiter({ prefix: 'native-session-mcp-mint', ttlSeconds: 60 })
    for (let seed = 0; seed < 9; seed += 1)
      await limiter.addAndCheck([`session:${sessionLimited.sid}`], 10)
    await mint(sessionLimited.cookies).expect(429)

    const userLimited = await sessionCookies('native')
    for (let seed = 0; seed < 29; seed += 1)
      await limiter.addAndCheck([`user:${userLimited.user.id}`], 30)
    await mint(userLimited.cookies).expect(429)
  })

  it('cuts off a minted token when its session is revoked', async () => {
    const native = await sessionCookies('native')
    const { body } = await mint(native.cookies).expect(200)
    expect(await revokeAuthenticatedSession(native.user.id, native.sid)).toBe(true)
    await expect(validateOAuthAccessToken(body.access_token, 'user')).resolves.toBeNull()
  })

  it('cuts off a minted token when the session expires', async () => {
    const native = await sessionCookies('native')
    const { body } = await mint(native.cookies).expect(200)
    await expireTestUserSession(native.sid)
    await expect(validateOAuthAccessToken(body.access_token, 'user')).resolves.toBeNull()
  })

  it('cuts off tokens through logout, single-session deletion and bulk revocation routes', async () => {
    for (const kind of ['logout', 'delete', 'bulk'] as const) {
      const native = await sessionCookies('native')
      const { body } = await mint(native.cookies).expect(200)
      if (kind === 'logout') {
        await createRequest().post('/api/v1/auth/logout').set('Cookie', native.cookies).expect(204)
      } else if (kind === 'delete') {
        await createRequest()
          .delete(`/api/v1/auth/sessions/${native.sid}`)
          .set('Cookie', native.cookies)
          .expect(204)
      } else {
        await createRequest()
          .post('/api/v1/auth/sessions/revocations')
          .set('Cookie', native.cookies)
          .expect(204)
      }
      await expect(validateOAuthAccessToken(body.access_token, 'user')).resolves.toBeNull()
    }
  })

  it('denies a suspended owner and cuts off its already minted token', async () => {
    const native = await sessionCookies('native')
    const { body } = await mint(native.cookies).expect(200)
    await suspendTestUser(native.user.id)
    try {
      await expect(validateOAuthAccessToken(body.access_token, 'user')).resolves.toBeNull()
      await mint(native.cookies).expect(403)
    } finally {
      await unsuspendTestUser(native.user.id)
    }
  })

  it('cuts off an already minted token after account deletion', async () => {
    const native = await sessionCookies('native')
    const { body } = await mint(native.cookies).expect(200)
    await softDeleteUser(native.user.id)
    await expect(validateOAuthAccessToken(body.access_token, 'user')).resolves.toBeNull()
  })

  it('keeps a Free member write denied and audited over MCP HTTP', async () => {
    const native = await sessionCookies('native')
    const { body } = await mint(native.cookies).expect(200)
    const response = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${body.access_token}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'edit_my_profile',
          arguments: optionArgs('bio', { markdown: 'Native Free write must fail' }),
        },
      })
      .expect(200)
    expect(response.body.error?.code).toBe(-32600)
    expect(await getProfile(native.user.id)).toEqual({ id: native.user.id, markdown: '' })
    expect(await readTestMcpCallAuditEvents(native.user.id)).toEqual([
      expect.objectContaining({ tool_name: 'edit_my_profile', outcome: 'plan_denied' }),
    ])
  })
})
