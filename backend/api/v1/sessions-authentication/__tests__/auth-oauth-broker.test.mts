import { describe, expect, it, onTestFinished } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { oauthAuthorizationBrokerConfig } from '@services/oauth'
import {
  createTestUser,
  insertTestOAuthAccount,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { v7 as uuidv7 } from 'uuid'

describe('OAuth broker routes', () => {
  it('serves rollback-sensitive broker capabilities without caching', async () => {
    const restoreBrokerConfig = overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
      github_web_enabled: true,
    })
    onTestFinished(restoreBrokerConfig)
    const request = createRequest()

    const enabledResponse = await request.get('/api/v1/auth/oauth/providers').expect(200)
    expect(enabledResponse.headers['cache-control']).toBe('no-store')
    expect(enabledResponse.body.broker_capabilities.github.modes.web).toBe(
      enabledResponse.body.providers.includes('github'),
    )

    overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
      github_web_enabled: false,
    })

    const disabledResponse = await request.get('/api/v1/auth/oauth/providers').expect(200)
    expect(disabledResponse.headers['cache-control']).toBe('no-store')
    expect(disabledResponse.body.broker_capabilities.github.modes.web).toBe(false)
  })

  it('rejects malformed completion flow IDs before body or cookie credential processing', async () => {
    const request = createRequest()
    const completionToken = randomBytes(32).toString('base64url')

    const bodyResponse = await request
      .post('/api/v1/auth/oauth/authorizations/not-a-uuid/complete')
      .send({ completion_token: completionToken })
      .expect(422)
    expect(bodyResponse.body.message).toBe('Invalid flow ID')

    const cookieResponse = await request
      .post('/api/v1/auth/oauth/authorizations/not-a-uuid/complete')
      .set('Cookie', `oauth_completion=not-a-uuid.${completionToken}`)
      .send({})
      .expect(422)
    expect(cookieResponse.body.message).toBe('Invalid flow ID')
  })

  it('validates provider, purpose, and callback mode before starting a flow', async () => {
    const request = createRequest()

    await request
      .post('/api/v1/auth/oauth/google/authorizations')
      .send({ purpose: 'authenticate', callback_mode: 'web' })
      .expect(404)
    await request
      .post('/api/v1/auth/oauth/github/authorizations')
      .send({ purpose: 'invalid', callback_mode: 'web' })
      .expect(422)
    await request
      .post('/api/v1/auth/oauth/github/authorizations')
      .send({ purpose: 'authenticate', callback_mode: 'invalid' })
      .expect(422)
  })

  it('relays web and native callbacks through their dedicated handoffs', async () => {
    const webState = randomBytes(32).toString('base64url')
    const webExpiresAt = new Date(Date.now() + 90_000)
    const webFlowId = await insertTestOAuthAuthorization({
      provider: 'facebook',
      callbackMode: 'web',
      state: webState,
      expiresAt: webExpiresAt,
    })
    const nativeState = randomBytes(32).toString('base64url')
    const nativeFlowId = await insertTestOAuthAuthorization({
      provider: 'facebook',
      callbackMode: 'native',
      state: nativeState,
      completionProofChallenge: 'A'.repeat(43),
    })
    registerFixtureCleanup({ authorizationIds: [webFlowId, nativeFlowId] })

    const webRequest = createRequest()
    const webCallback = await webRequest
      .get('/api/v1/auth/oauth/facebook/broker-callback')
      .query({ state: webState, error: 'access denied' })
      .expect(302)

    const webLocation = new URL(webCallback.headers.location as string)
    expect(webLocation.pathname).toBe('/auth/callback/broker')
    expect(webLocation.searchParams.get('flow_id')).toBe(webFlowId)
    expect(webCallback.headers).toMatchObject({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow',
    })
    expect(webCallback.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('oauth_completion=')]),
    )
    const setCookies = webCallback.headers['set-cookie']
    const completionCookie = (Array.isArray(setCookies) ? setCookies : [setCookies]).find(cookie =>
      cookie?.startsWith('oauth_completion='),
    )
    expect(completionCookie).toBeDefined()
    if (!completionCookie) throw new Error('OAuth completion cookie missing')
    const maxAge = Number(/Max-Age=(\d+)/.exec(completionCookie)?.[1])
    expect(maxAge).toBeGreaterThan(0)
    expect(maxAge).toBeLessThanOrEqual(90)
    await webRequest
      .post(`/api/v1/auth/oauth/authorizations/${webFlowId}/complete`)
      .send({})
      .expect(403)

    const nativeRequest = createRequest()
    const nativeCallback = await nativeRequest
      .get('/api/v1/auth/oauth/facebook/broker-callback')
      .query({ state: nativeState, error: 'access denied' })
      .expect(302)

    const nativeLocation = new URL(nativeCallback.headers.location as string)
    expect(`${nativeLocation.protocol}//${nativeLocation.host}${nativeLocation.pathname}`).toBe(
      'voucha://auth/oauth/callback',
    )
    expect(nativeLocation.searchParams.get('flow_id')).toBe(nativeFlowId)
    expect(nativeLocation.searchParams.get('completion_token')).toEqual(expect.any(String))
  })

  it('returns retry metadata while a web exchange is pending', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const completionToken = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({
      purpose: 'connect',
      initiatingUserId: user.id,
      status: 'callback_received',
      callbackReceivedAt: new Date(),
      deviceId: request.did,
      sessionId: request.sid,
      completionToken,
      completionTokenCiphertext: 'test-completion-ciphertext',
    })
    registerFixtureCleanup({ authorizationIds: [flowId], userIds: [user.id] })

    const response = await request
      .post(`/api/v1/auth/oauth/authorizations/${flowId}/complete`)
      .set('Cookie', `${request.authCookie}; oauth_completion=${flowId}.${completionToken}`)
      .send({})
      .expect(202)

    expect(response.body).toEqual({ status: 'pending' })
    expect(response.headers).toMatchObject({
      'cache-control': 'no-store',
      'retry-after': '1',
    })
  })

  it('retains a terminal web completion credential until explicit acknowledgement', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const completionToken = randomBytes(32).toString('base64url')
    const providerUserId = `broker-route-${randomUUID()}`
    await insertTestOAuthAccount('facebook', providerUserId, `tests+${providerUserId}@voucha.ai`)
    const now = new Date()
    const flowId = await insertTestOAuthAuthorization({
      provider: 'facebook',
      purpose: 'connect',
      initiatingUserId: user.id,
      status: 'completion_ready',
      callbackReceivedAt: now,
      completionReadyAt: now,
      deviceId: request.did,
      sessionId: request.sid,
      completionToken,
      completionTokenCiphertext: 'test-completion-ciphertext',
      providerUserId,
    })
    registerFixtureCleanup({
      authorizationIds: [flowId],
      facebookUserIds: [providerUserId],
      userIds: [user.id],
    })

    const response = await request
      .post(`/api/v1/auth/oauth/authorizations/${flowId}/complete`)
      .set('Cookie', `${request.authCookie}; oauth_completion=${flowId}.${completionToken}`)
      .send({})
      .expect(200)

    expect(response.body.oauth_account).toMatchObject({ id: providerUserId })
    expect(response.headers['set-cookie'] ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining('oauth_completion=;')]),
    )
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      completion_token_hash: expect.any(String),
    })

    await request
      .post(`/api/v1/auth/oauth/authorizations/${flowId}/complete`)
      .set('Cookie', `${request.authCookie}; oauth_completion=${flowId}.${completionToken}`)
      .send({})
      .expect(200)

    const acknowledgement = await request
      .post(`/api/v1/auth/oauth/authorizations/${flowId}/complete`)
      .set('Cookie', `${request.authCookie}; oauth_completion=${flowId}.${completionToken}`)
      .send({ acknowledge: true })
      .expect(204)

    expect(acknowledgement.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`oauth_completion=;.*Max-Age=0.*${flowId}`)),
      ]),
    )
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({ completion_token_hash: null })

    await request
      .post(`/api/v1/auth/oauth/authorizations/${flowId}/complete`)
      .set('Cookie', `${request.authCookie}; oauth_completion=${flowId}.${completionToken}`)
      .send({})
      .expect(401)
  })

  it('replays a durable authentication result into browser session cookies', async () => {
    const user = await createTestUser()
    const did = uuidv7()
    const sid = uuidv7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, sid })
    const request = createRequest()
    const completionToken = randomBytes(32).toString('base64url')
    const providerUserId = `broker-auth-route-${randomUUID()}`
    await insertTestOAuthAccount('facebook', providerUserId, `tests+${providerUserId}@voucha.ai`)
    const now = new Date()
    const flowId = await insertTestOAuthAuthorization({
      provider: 'facebook',
      status: 'completed',
      callbackReceivedAt: now,
      completionReadyAt: now,
      completedAt: now,
      deviceId: did,
      sessionId: sid,
      completionToken,
      providerUserId,
      resultKind: 'authenticated',
      resultUserId: user.id,
    })
    registerFixtureCleanup({
      authorizationIds: [flowId],
      facebookUserIds: [providerUserId],
      userIds: [user.id],
    })

    const response = await request
      .post(`/api/v1/auth/oauth/authorizations/${flowId}/complete`)
      .set(
        'Cookie',
        `dt=${deviceToken.token}; st=${sessionToken.token}; oauth_completion=${flowId}.${completionToken}`,
      )
      .send({})
      .expect(200)

    expect(response.body.user).toMatchObject({ id: user.id, username: user.username })
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('dt='), expect.stringContaining('st=')]),
    )
    expect(response.headers['set-cookie']).not.toEqual(
      expect.arrayContaining([expect.stringContaining('oauth_completion=;')]),
    )
  })
})

function registerFixtureCleanup(
  fixtures: Parameters<typeof deleteTestOAuthAuthorizationFixtures>[0],
): void {
  onTestFinished(async () => {
    await deleteTestOAuthAuthorizationFixtures(fixtures)
  })
}
