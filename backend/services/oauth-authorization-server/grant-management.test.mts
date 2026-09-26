import { beforeAll, describe, expect, it } from 'vitest'
import { setTestOAuthClientVerified } from '@voucha/test-helpers/entities/oauth-client-management'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestApprovedOAuthAuthorization, TEST_OAUTH_RESOURCE } from './test-support.mts'
import {
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
