import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'

vi.stubEnv('FACEBOOK_APP_ID', 'synthetic-begin-facebook-app')
vi.stubEnv('FACEBOOK_APP_SECRET', 'synthetic-begin-facebook-secret')
vi.stubEnv('GITHUB_CLIENT_ID', 'synthetic-begin-github-client')
vi.stubEnv('GITHUB_CLIENT_SECRET', 'synthetic-begin-github-secret')
vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic-begin-google-client')
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'synthetic-begin-google-secret')
vi.resetModules()
const {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} = await import('@voucha/test-helpers/entities/oauth-authorizations')
const { closeScopedDynamicConfigContext, overrideDynamicConfigFieldsForTest } =
  await import('@voucha/test-helpers/dynamic-config')
const { beginOAuthAuthorization } = await import('../authorization-broker.mts')
const { oauthAuthorizationBrokerConfig } = await import('../broker-config.mts')

describe('OAuth authorization broker begin', () => {
  afterAll(() => vi.unstubAllEnvs())

  it('begins enabled web and native authorizations with strict ownership and proof rules', async () => {
    const cleanup = registerCleanup()
    await oauthAuthorizationBrokerConfig.waitForInitialization()
    overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
      facebook_web_enabled: true,
      facebook_native_enabled: true,
      google_native_enabled: true,
    })
    registerConfigCleanup()

    await expect(
      beginOAuthAuthorization({
        provider: 'facebook',
        purpose: 'connect',
        callbackMode: 'web',
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        expectedOrigin: 'https://example.com/path',
      }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      beginOAuthAuthorization({
        provider: 'facebook',
        purpose: 'authenticate',
        callbackMode: 'web',
        currentUserId: randomUUID(),
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        expectedOrigin: 'https://example.com',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      beginOAuthAuthorization({
        provider: 'facebook',
        purpose: 'authenticate',
        callbackMode: 'native',
        completionProofChallenge: 'too-short',
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        expectedOrigin: 'https://example.com',
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      beginOAuthAuthorization({
        provider: 'facebook',
        purpose: 'authenticate',
        callbackMode: 'web',
        completionProofChallenge: 'A'.repeat(43),
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        expectedOrigin: 'https://example.com',
      }),
    ).rejects.toMatchObject({ status: 422 })

    const result = await beginOAuthAuthorization({
      provider: 'facebook',
      purpose: 'authenticate',
      callbackMode: 'native',
      completionProofChallenge: 'A'.repeat(43),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      expectedOrigin: 'https://example.com/path',
    })
    cleanup.authorizationIds.push(result.flow_id)

    expect(result.expires_at).toEqual(expect.any(String))
    const redirect = new URL(result.redirect_url)
    expect(redirect.searchParams.get('client_id')).toBe('synthetic-begin-facebook-app')
    expect(redirect.searchParams.get('redirect_uri')).toBe(
      'https://example.com/auth/callback/facebook/broker',
    )
    expect(redirect.searchParams.get('state')).toEqual(expect.any(String))
    expect(await getTestOAuthAuthorization(result.flow_id)).toMatchObject({ status: 'pending' })

    const google = await beginOAuthAuthorization({
      provider: 'google',
      purpose: 'authenticate',
      callbackMode: 'native',
      completionProofChallenge: 'B'.repeat(43),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      expectedOrigin: 'https://example.com',
    })
    cleanup.authorizationIds.push(google.flow_id)
    const googleRedirect = new URL(google.redirect_url)
    expect(googleRedirect.origin + googleRedirect.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(googleRedirect.searchParams.get('client_id')).toBe('synthetic-begin-google-client')
    expect(googleRedirect.searchParams.get('code_challenge_method')).toBe('S256')
    expect(await getTestOAuthAuthorization(google.flow_id)).toMatchObject({
      status: 'pending',
      google_account_id: null,
    })
  })

  it('fails closed when a provider and callback mode are disabled', async () => {
    await expect(
      beginOAuthAuthorization({
        provider: 'github',
        purpose: 'authenticate',
        callbackMode: 'web',
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        expectedOrigin: 'https://example.com',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('preserves an existing flow when required provider credentials are unavailable', async () => {
    const cleanup = registerCleanup()
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const existingFlowId = await insertTestOAuthAuthorization({ deviceId, sessionId })
    cleanup.authorizationIds.push(existingFlowId)

    await expect(
      beginOAuthAuthorization({
        provider: 'github',
        purpose: 'authenticate',
        callbackMode: 'web',
        deviceId,
        sessionId,
        expectedOrigin: 'https://example.com',
      }),
    ).rejects.toMatchObject({ status: 404 })

    expect(await getTestOAuthAuthorization(existingFlowId)).toMatchObject({ status: 'pending' })
  })

  it('supersedes an unfinished web authentication for the same browser session', async () => {
    const cleanup = registerCleanup()
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const previousFlowId = await insertTestOAuthAuthorization({
      callbackMode: 'web',
      deviceId,
      purpose: 'authenticate',
      sessionId,
    })
    cleanup.authorizationIds.push(previousFlowId)
    await enableWebBrokerForTest()

    const replacement = await beginTestWebAuthentication(deviceId, sessionId)
    cleanup.authorizationIds.push(replacement.flow_id)

    expect(await getTestOAuthAuthorization(previousFlowId)).toMatchObject({
      status: 'rejected',
      callback_error: 'authorization_superseded',
    })
    expect(await getTestOAuthAuthorization(replacement.flow_id)).toMatchObject({
      status: 'pending',
    })
  })

  it('serializes concurrent replacement web authentications for one browser session', async () => {
    const cleanup = registerCleanup()
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    await enableWebBrokerForTest()

    const results = await Promise.all([
      beginTestWebAuthentication(deviceId, sessionId),
      beginTestWebAuthentication(deviceId, sessionId),
    ])
    cleanup.authorizationIds.push(...results.map(result => result.flow_id))

    const rows = await Promise.all(results.map(result => getTestOAuthAuthorization(result.flow_id)))
    expect(rows.map(row => row?.status).toSorted()).toEqual(['pending', 'rejected'])
    expect(rows.find(row => row?.status === 'rejected')).toMatchObject({
      callback_error: 'authorization_superseded',
    })
  })
})

function registerCleanup(): { authorizationIds: string[] } {
  const cleanup = { authorizationIds: [] as string[] }
  onTestFinished(async () => {
    await deleteTestOAuthAuthorizationFixtures(cleanup)
  })
  return cleanup
}

async function enableWebBrokerForTest(): Promise<void> {
  await oauthAuthorizationBrokerConfig.waitForInitialization()
  overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
    github_web_enabled: true,
  })
  registerConfigCleanup()
}

function registerConfigCleanup(): void {
  onTestFinished(async () => {
    await closeScopedDynamicConfigContext([oauthAuthorizationBrokerConfig])
  })
}

function beginTestWebAuthentication(deviceId: string, sessionId: string) {
  return beginOAuthAuthorization({
    provider: 'github',
    purpose: 'authenticate',
    callbackMode: 'web',
    deviceId,
    sessionId,
    expectedOrigin: 'https://example.com',
  })
}
