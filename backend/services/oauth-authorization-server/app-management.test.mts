import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { clientSecretMatchesStoredHash } from '@voucha/test-helpers/entities/oauth-authorization-server'
import {
  assignTestOAuthClientOwner,
  setTestOAuthClientVerified,
} from '@voucha/test-helpers/entities/oauth-client-management'
import {
  createTestApprovedOAuthAuthorization,
  randomTestOAuthRedirectUri,
} from './test-support.mts'
import {
  authenticateOAuthClient,
  createOwnedOAuthApp,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  listOwnedOAuthApps,
  MAX_OAUTH_APP_SCOPES,
  revokeOwnedOAuthApp,
  rotateOwnedOAuthAppSecret,
  updateOwnedOAuthApp,
  validateOAuthAccessToken,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

const MISSING_ID = '00000000-0000-7000-8000-000000000000'

function appInput(overrides: Record<string, unknown> = {}) {
  return {
    client_name: `Owned app ${randomBytes(6).toString('hex')}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
    scopes: ['mcp.user:read'],
    ...overrides,
  }
}

describe('owned OAuth app management', () => {
  let owner: TestUser
  let stranger: TestUser

  beforeAll(async () => {
    owner = await createTestUserDirect()
    stranger = await createTestUserDirect()
  })

  it('registers a confidential app whose secret is shown once and stored as a hash', async () => {
    const issued = await createOwnedOAuthApp(
      owner.id,
      appInput({ token_endpoint_auth_method: 'client_secret_basic' }),
    )

    expect(issued.oauth_app).toMatchObject({
      client_type: 'confidential',
      token_endpoint_auth_method: 'client_secret_basic',
      scopes: ['mcp.user:read'],
      verified_at: null,
    })
    expect(issued.client_secret).toMatch(/^voucha_secret_/)
    await expect(
      clientSecretMatchesStoredHash(issued.oauth_app.client_id, issued.client_secret!),
    ).resolves.toBe(true)
    const owned = await listOwnedOAuthApps(owner.id, { limit: 100 })
    expect(owned.results.map(app => app.id)).toContain(issued.oauth_app.id)
    const foreign = await listOwnedOAuthApps(stranger.id, { limit: 100 })
    expect(foreign.results.map(app => app.id)).not.toContain(issued.oauth_app.id)
  })

  it('registers a public app without a secret', async () => {
    const issued = await createOwnedOAuthApp(owner.id, appInput())
    expect(issued.client_secret).toBeNull()
    expect(issued.oauth_app).toMatchObject({
      client_type: 'public',
      token_endpoint_auth_method: 'none',
    })
  })

  it('requires each scope entry to be one canonical scope', async () => {
    await expect(
      createOwnedOAuthApp(owner.id, appInput({ scopes: ['mcp.user:read mcp.user:write'] })),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
    await expect(
      createOwnedOAuthApp(owner.id, appInput({ scopes: 'mcp.user:read' })),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
    const tooMany = Array.from({ length: MAX_OAUTH_APP_SCOPES + 1 }, () => 'mcp.user:read')
    await expect(
      createOwnedOAuthApp(owner.id, appInput({ scopes: tooMany })),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
  })

  it('applies the dynamic registration validators', async () => {
    await expect(
      createOwnedOAuthApp(owner.id, appInput({ redirect_uris: ['http://example.com/callback'] })),
    ).rejects.toMatchObject({ code: 'invalid_redirect_uri' })
    await expect(
      createOwnedOAuthApp(owner.id, appInput({ scopes: ['mcp.user:write'] })),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
  })

  it('pages owned apps newest first', async () => {
    const pager = await createTestUserDirect()
    const first = await createOwnedOAuthApp(pager.id, appInput())
    const second = await createOwnedOAuthApp(pager.id, appInput())

    const page = await listOwnedOAuthApps(pager.id, { limit: 1 })
    expect(page).toMatchObject({ hasNextPage: true })
    expect(page.results.map(app => app.id)).toEqual([second.oauth_app.id])
    const next = await listOwnedOAuthApps(pager.id, { limit: 1, afterId: second.oauth_app.id })
    expect(next).toMatchObject({ hasNextPage: false })
    expect(next.results.map(app => app.id)).toEqual([first.oauth_app.id])
  })

  it('clears staff verification when the name or redirect URIs change', async () => {
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, appInput())
    await setTestOAuthClientVerified(app.id, stranger.id)

    const unchanged = await updateOwnedOAuthApp(owner.id, app.id, {
      client_name: app.client_name,
    })
    expect(unchanged?.verified_at).toBeInstanceOf(Date)
    const renamed = await updateOwnedOAuthApp(owner.id, app.id, { client_name: ' Renamed app ' })
    expect(renamed).toMatchObject({ client_name: 'Renamed app', verified_at: null })

    await setTestOAuthClientVerified(app.id, stranger.id)
    const redirectUri = randomTestOAuthRedirectUri()
    const redirected = await updateOwnedOAuthApp(owner.id, app.id, {
      redirect_uris: [redirectUri],
    })
    expect(redirected).toMatchObject({ redirect_uris: [redirectUri], verified_at: null })
  })

  it('rejects empty and foreign app updates', async () => {
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, appInput())
    await expect(updateOwnedOAuthApp(owner.id, app.id, {})).rejects.toMatchObject({
      code: 'invalid_client_metadata',
    })
    await expect(updateOwnedOAuthApp(owner.id, app.id, { client_name: '' })).rejects.toMatchObject({
      code: 'invalid_client_metadata',
    })
    await expect(
      updateOwnedOAuthApp(stranger.id, app.id, { client_name: 'Taken over' }),
    ).resolves.toBeNull()
  })

  it('rotates a confidential secret so only the new secret authenticates', async () => {
    const issued = await createOwnedOAuthApp(
      owner.id,
      appInput({ token_endpoint_auth_method: 'client_secret_basic' }),
    )
    const rotation = await rotateOwnedOAuthAppSecret(owner.id, issued.oauth_app.id)
    if (rotation.outcome !== 'rotated') throw new Error(`unexpected ${rotation.outcome}`)

    const clientId = issued.oauth_app.client_id
    await expect(authenticateOAuthClient(clientId, issued.client_secret!)).rejects.toMatchObject({
      code: 'invalid_client',
    })
    await expect(
      authenticateOAuthClient(clientId, rotation.issued.client_secret!),
    ).resolves.toBeUndefined()
    await expect(rotateOwnedOAuthAppSecret(stranger.id, issued.oauth_app.id)).resolves.toEqual({
      outcome: 'not_found',
    })
  })

  it('refuses to mint a secret for a public app', async () => {
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, appInput())
    await expect(rotateOwnedOAuthAppSecret(owner.id, app.id)).resolves.toEqual({
      outcome: 'public_client',
    })
    await expect(rotateOwnedOAuthAppSecret(owner.id, MISSING_ID)).resolves.toEqual({
      outcome: 'not_found',
    })
  })

  it('revokes an app so its outstanding tokens stop working', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    await assignTestOAuthClientOwner(flow.client.client_id, owner.id)
    const owned = await listOwnedOAuthApps(owner.id, { limit: 100 })
    const app = owned.results.find(candidate => candidate.client_id === flow.client.client_id)!

    await expect(revokeOwnedOAuthApp(stranger.id, app.id)).resolves.toBe(false)
    await expect(revokeOwnedOAuthApp(owner.id, app.id)).resolves.toBe(true)
    await expect(revokeOwnedOAuthApp(owner.id, app.id)).resolves.toBe(false)
    await expect(validateOAuthAccessToken(tokens.access_token)).resolves.toBeNull()
    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_client' })
    const remaining = await listOwnedOAuthApps(owner.id, { limit: 100 })
    expect(remaining.results.map(candidate => candidate.id)).not.toContain(app.id)
  })
})
