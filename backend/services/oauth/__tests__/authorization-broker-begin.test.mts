import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { beginOAuthAuthorization } from '../authorization-broker.mts'
import { oauthAuthorizationBrokerConfig } from '../broker-config.mts'

describe('OAuth authorization broker begin', () => {
  it('begins enabled web and native authorizations with strict ownership and proof rules', async () => {
    const cleanup = registerCleanup()
    overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
      facebook_web_enabled: true,
      facebook_native_enabled: true,
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

    const result = await beginOAuthAuthorization(
      {
        provider: 'facebook',
        purpose: 'authenticate',
        callbackMode: 'native',
        completionProofChallenge: 'A'.repeat(43),
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        expectedOrigin: 'https://example.com/path',
      },
      {
        getClientId: provider => `test-${provider}-client`,
        isProviderEnabled: () => true,
      },
    )
    cleanup.authorizationIds.push(result.flow_id)

    expect(result.expires_at).toEqual(expect.any(String))
    const redirect = new URL(result.redirect_url)
    expect(redirect.searchParams.get('redirect_uri')).toBe(
      'https://example.com/auth/callback/facebook/broker',
    )
    expect(redirect.searchParams.get('state')).toEqual(expect.any(String))
    expect(await getTestOAuthAuthorization(result.flow_id)).toMatchObject({ status: 'pending' })
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
      beginOAuthAuthorization(
        {
          provider: 'github',
          purpose: 'authenticate',
          callbackMode: 'web',
          deviceId,
          sessionId,
          expectedOrigin: 'https://example.com',
        },
        {
          getClientId: () => 'test-github-client',
          isProviderEnabled: () => false,
        },
      ),
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
    enableWebBrokerForTest()

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
    enableWebBrokerForTest()

    const results = await Promise.all([
      beginTestWebAuthentication(deviceId, sessionId),
      beginTestWebAuthentication(deviceId, sessionId),
    ])
    cleanup.authorizationIds.push(...results.map(result => result.flow_id))

    const rows = await Promise.all(results.map(result => getTestOAuthAuthorization(result.flow_id)))
    expect(rows.map(row => row?.status).sort()).toEqual(['pending', 'rejected'])
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

function enableWebBrokerForTest(): void {
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
  return beginOAuthAuthorization(
    {
      provider: 'github',
      purpose: 'authenticate',
      callbackMode: 'web',
      deviceId,
      sessionId,
      expectedOrigin: 'https://example.com',
    },
    {
      getClientId: provider => `test-${provider}-client`,
      isProviderEnabled: () => true,
    },
  )
}
