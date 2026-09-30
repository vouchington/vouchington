import { createHash, randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setTestOAuthClientVerified } from '@voucha/test-helpers/entities/oauth-client-management'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestApprovedOAuthAuthorization,
  TEST_OAUTH_RESOURCE,
  TEST_OAUTH_SCOPE,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  beginOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  listUserOAuthGrants,
  revokeUserOAuthGrant,
  validateOAuthAccessToken,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

async function authorizeAndExchange(user: TestUser) {
  const flow = await createTestApprovedOAuthAuthorization(user)
  const tokens = await exchangeOAuthAuthorizationCode({
    clientId: flow.client.client_id,
    code: flow.code,
    codeVerifier: flow.verifier,
    redirectUri: flow.redirectUri,
  })
  return { flow, tokens }
}

describe('user OAuth grant management', () => {
  let user: TestUser
  let stranger: TestUser

  beforeAll(async () => {
    user = await createTestUserDirect()
    stranger = await createTestUserDirect()
  })

  it('reports no last use after fresh consent', async () => {
    const flow = await createTestApprovedOAuthAuthorization(user)

    const grant = await findGrantForClient(user.id, flow.client.client_id)
    expect(grant.last_used_at).toBeNull()
  })

  it('keeps last use empty when the user consents again before any use', async () => {
    const flow = await createTestApprovedOAuthAuthorization(user)

    await approveExistingClient(user.id, flow.client.client_id, flow.redirectUri)

    const grant = await findGrantForClient(user.id, flow.client.client_id)
    expect(grant.last_used_at).toBeNull()
  })

  it('preserves a real use timestamp when the user consents again', async () => {
    const { flow } = await authorizeAndExchange(user)
    const before = await findGrantForClient(user.id, flow.client.client_id)
    expect(before.last_used_at).not.toBeNull()

    await approveExistingClient(user.id, flow.client.client_id, flow.redirectUri)

    const after = await findGrantForClient(user.id, flow.client.client_id)
    expect(after.last_used_at).toEqual(before.last_used_at)
  })

  it('lists authorized apps with their resource, scopes and latest bearer use', async () => {
    const { flow, tokens } = await authorizeAndExchange(user)
    const before = await listUserOAuthGrants(user.id, { limit: 100 })
    const listed = before.results.find(grant => grant.client.client_id === flow.client.client_id)!
    expect(listed).toMatchObject({
      client: { client_name: flow.client.client_name, verified: false },
      resource: TEST_OAUTH_RESOURCE,
      scopes: ['mcp.user:read', 'mcp.user:write'],
    })

    await validateOAuthAccessToken(tokens.access_token, 'user')
    const after = await listUserOAuthGrants(user.id, { limit: 100 })
    const used = after.results.find(grant => grant.id === listed.id)!
    if (!listed.last_used_at || !used.last_used_at) {
      throw new Error('Token exchange and bearer validation must record OAuth grant use')
    }
    expect(used.last_used_at.getTime()).toBeGreaterThanOrEqual(listed.last_used_at.getTime())
    const foreign = await listUserOAuthGrants(stranger.id, { limit: 100 })
    expect(foreign.results.map(grant => grant.id)).not.toContain(listed.id)
  })

  it('marks a grant whose client staff verified', async () => {
    const { flow } = await authorizeAndExchange(user)
    const page = await listUserOAuthGrants(user.id, { limit: 100 })
    const grant = page.results.find(
      candidate => candidate.client.client_id === flow.client.client_id,
    )!
    await setTestOAuthClientVerified(grant.client.id, stranger.id)

    const verified = await listUserOAuthGrants(user.id, { limit: 100 })
    expect(verified.results.find(candidate => candidate.id === grant.id)?.client.verified).toBe(
      true,
    )
  })

  it('pages grants newest first', async () => {
    const pager = await createTestUserDirect()
    await authorizeAndExchange(pager)
    await authorizeAndExchange(pager)

    const page = await listUserOAuthGrants(pager.id, { limit: 1 })
    expect(page.hasNextPage).toBe(true)
    const next = await listUserOAuthGrants(pager.id, { limit: 1, afterId: page.results[0]!.id })
    expect(next.hasNextPage).toBe(false)
    expect(next.results[0]!.id.localeCompare(page.results[0]!.id)).toBeLessThan(0)
  })

  it('revokes a grant so its bearer and refresh tokens stop working', async () => {
    const { flow, tokens } = await authorizeAndExchange(user)
    const page = await listUserOAuthGrants(user.id, { limit: 100 })
    const grant = page.results.find(
      candidate => candidate.client.client_id === flow.client.client_id,
    )!

    await expect(revokeUserOAuthGrant(stranger.id, grant.id)).resolves.toBe(false)
    await expect(revokeUserOAuthGrant(user.id, grant.id)).resolves.toBe(true)
    await expect(revokeUserOAuthGrant(user.id, grant.id)).resolves.toBe(false)
    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    const remaining = await listUserOAuthGrants(user.id, { limit: 100 })
    expect(remaining.results.map(candidate => candidate.id)).not.toContain(grant.id)
  })
})

async function findGrantForClient(userId: string, clientId: string) {
  const page = await listUserOAuthGrants(userId, { limit: 100 })
  const grant = page.results.find(candidate => candidate.client.client_id === clientId)
  if (!grant) throw new Error('OAuth grant was not listed')
  return grant
}

async function approveExistingClient(userId: string, clientId: string, redirectUri: string) {
  const verifier = randomBytes(32).toString('base64url')
  const deviceId = uuidv7()
  const sessionId = uuidv7()
  const request = await beginOAuthAuthorizationRequest({
    clientId,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod: 'S256',
    deviceId,
    redirectUri,
    resource: TEST_OAUTH_RESOURCE,
    responseType: 'code',
    scope: TEST_OAUTH_SCOPE,
    sessionId,
    state: randomBytes(16).toString('base64url'),
    userId,
  })
  await decideOAuthAuthorizationRequest(
    userId,
    request.request_id,
    'approve',
    createOAuthBrowserBindingHash(deviceId, sessionId),
  )
}
