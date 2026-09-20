import { createHash, randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUserDirect,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers/entities/users'
import {
  expireTestOAuthRefreshToken,
  getTestOAuthCredentialStorage,
  setTestOAuthRefreshFamilyExpiry,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import { getTestOAuthLifecycleEvents } from '@voucha/test-helpers/entities/oauth-authorization-server-events'
import {
  beginOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  registerOAuthClient,
  validateOAuthAccessToken,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

const RESOURCE = 'http://localhost:2900/api/v1/mcp'
const SCOPE = 'mcp.user:read mcp.user:write'

describe('OAuth refresh tokens', () => {
  let owner: TestUser

  beforeAll(async () => {
    owner = await createTestUserDirect()
  })

  it('rotates refresh tokens and revokes a reused family', async () => {
    const flow = await createApprovedAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const rotated = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: initial.refresh_token,
    })

    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: initial.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(
      getTestOAuthCredentialStorage({ refreshToken: initial.refresh_token }),
    ).resolves.toMatchObject({
      refreshTokenConsumed: true,
      refreshFamilyRevoked: true,
      refreshReuseDetected: true,
    })
    await expect(validateOAuthAccessToken(rotated.access_token)).resolves.toBeNull()
    await expect(getTestOAuthLifecycleEvents(flow.client.client_id)).resolves.toContain(
      'refresh_reuse_detected',
    )
    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: rotated.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('serializes concurrent refresh exchange and revokes the replayed family', async () => {
    const flow = await createApprovedAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })

    const exchanges = await Promise.allSettled([
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: initial.refresh_token,
      }),
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: initial.refresh_token,
      }),
    ])

    expect(exchanges.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(exchanges.filter(result => result.status === 'rejected')).toHaveLength(1)
    await expect(
      getTestOAuthCredentialStorage({ refreshToken: initial.refresh_token }),
    ).resolves.toMatchObject({
      refreshTokenConsumed: true,
      refreshFamilyRevoked: true,
      refreshReuseDetected: true,
    })
    const successful = exchanges.find(result => result.status === 'fulfilled')
    if (!successful || successful.status !== 'fulfilled') throw new Error('exchange did not win')
    await expect(validateOAuthAccessToken(successful.value.access_token)).resolves.toBeNull()
  })

  it('preserves a narrowed scope across later refreshes', async () => {
    const flow = await createApprovedAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const narrowed = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: initial.refresh_token,
      scope: 'mcp.user:read',
    })
    const refreshed = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: narrowed.refresh_token,
    })

    expect(narrowed.scope).toBe('mcp.user:read')
    expect(refreshed.scope).toBe('mcp.user:read')
    await expect(
      validateOAuthAccessToken(refreshed.access_token, {
        requiredScopes: ['mcp.user:write'],
      }),
    ).resolves.toBeNull()
  })

  it('rejects an expired refresh token', async () => {
    const flow = await createApprovedAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    await expireTestOAuthRefreshToken(initial.refresh_token)

    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: initial.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('does not issue an access token beyond the refresh family expiry', async () => {
    const flow = await createApprovedAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const remainingSeconds = 30
    await setTestOAuthRefreshFamilyExpiry(
      initial.refresh_token,
      new Date(Date.now() + remainingSeconds * 1_000),
    )

    const refreshed = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: initial.refresh_token,
    })
    expect(refreshed.expires_in).toBeGreaterThan(0)
    expect(refreshed.expires_in).toBeLessThanOrEqual(remainingSeconds)
  })

  it('rejects access and refresh tokens while the grant owner is suspended', async () => {
    const flow = await createApprovedAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    await suspendTestUser(owner.id)

    try {
      await expect(validateOAuthAccessToken(initial.access_token)).resolves.toBeNull()
      await expect(
        exchangeOAuthRefreshToken({
          clientId: flow.client.client_id,
          refreshToken: initial.refresh_token,
        }),
      ).rejects.toMatchObject({ code: 'invalid_grant' })
    } finally {
      await unsuspendTestUser(owner.id)
    }
  })
})

async function createApprovedAuthorization(user: TestUser) {
  const redirectUri = randomRedirectUri()
  const client = await registerOAuthClient({
    client_name: `Test public ${randomBytes(6).toString('hex')}`,
    redirect_uris: [redirectUri],
    scope: SCOPE,
  })
  const verifier = randomBytes(32).toString('base64url')
  const deviceId = uuidv7()
  const sessionId = uuidv7()
  const request = await beginOAuthAuthorizationRequest({
    clientId: client.client_id,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod: 'S256',
    deviceId,
    redirectUri,
    resource: RESOURCE,
    responseType: 'code',
    scope: SCOPE,
    sessionId,
    state: randomBytes(16).toString('base64url'),
    userId: user.id,
  })
  const decision = await decideOAuthAuthorizationRequest(
    user.id,
    request.request_id,
    'approve',
    createOAuthBrowserBindingHash(deviceId, sessionId),
  )
  const code = new URL(decision.redirect_uri).searchParams.get('code')
  if (!code) throw new Error('authorization code was not returned')
  return { client, code, redirectUri, verifier }
}

function randomRedirectUri(): string {
  const port = 30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)
  return `http://127.0.0.1:${port}/callback/${randomBytes(6).toString('hex')}`
}
