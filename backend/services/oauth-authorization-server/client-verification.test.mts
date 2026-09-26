import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  getTestOAuthClientRowId,
  revokeTestOAuthClient,
  setTestOAuthClientMetadataUrl,
} from '@voucha/test-helpers/entities/oauth-client-management'
import { randomTestOAuthRedirectUri, TEST_OAUTH_SCOPE } from './test-support.mts'
import {
  currentUserCanVerifyOAuthClients,
  listOAuthClientsForVerification,
  registerOAuthClient,
  unverifyOAuthClient,
  verifyOAuthClient,
  type OAuthClientVerificationFilter,
  type OAuthClientVerificationReview,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

const MISSING_ID = '00000000-0000-7000-8000-000000000000'

async function registerTestClient(owner: TestUser | null = null) {
  const reviewed: OAuthClientVerificationReview = {
    client_name: `Verification ${randomBytes(6).toString('hex')}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
  }
  const registered = await registerOAuthClient(
    { ...reviewed, scope: TEST_OAUTH_SCOPE },
    owner?.id ?? null,
  )
  return { id: await getTestOAuthClientRowId(registered.client_id), reviewed }
}

async function listedIds(verification: OAuthClientVerificationFilter): Promise<string[]> {
  const page = await listOAuthClientsForVerification({ verification, limit: 100 })
  return page.results.map(client => client.id)
}

describe('staff OAuth client verification', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createTestUserDirect()
  })

  it('allows only administrators to verify clients', () => {
    expect(currentUserCanVerifyOAuthClients({ roles: ['administrator'] })).toBe(true)
    expect(currentUserCanVerifyOAuthClients({ roles: ['moderator'] })).toBe(false)
  })

  it('verifies the reviewed name and destinations and records who verified it', async () => {
    const owner = await createTestUserDirect()
    const client = await registerTestClient(owner)

    const result = await verifyOAuthClient(admin.id, client.id, client.reviewed)
    expect(result).toMatchObject({
      outcome: 'verified',
      client: { id: client.id, owner_user_id: owner.id, verified_by_id: admin.id },
    })
    await expect(listedIds('verified')).resolves.toContain(client.id)
    await expect(listedIds('unverified')).resolves.not.toContain(client.id)
    await expect(listedIds('all')).resolves.toContain(client.id)
  })

  it.each([
    ['a name', { client_name: 'Some other name' }],
    ['a redirect URI', { redirect_uris: [randomTestOAuthRedirectUri()] }],
  ])('refuses %s that changed since review', async (_label, stale) => {
    const client = await registerTestClient()
    await expect(
      verifyOAuthClient(admin.id, client.id, { ...client.reviewed, ...stale }),
    ).resolves.toEqual({ outcome: 'conflict' })
    await expect(listedIds('unverified')).resolves.toContain(client.id)
  })

  it('refuses revoked and metadata-document clients', async () => {
    const revoked = await registerTestClient()
    await revokeTestOAuthClient(revoked.id)
    const documented = await registerTestClient()
    await setTestOAuthClientMetadataUrl(
      documented.id,
      `https://example.com/clients/${randomBytes(6).toString('hex')}.json`,
    )

    await expect(verifyOAuthClient(admin.id, revoked.id, revoked.reviewed)).resolves.toEqual({
      outcome: 'conflict',
    })
    await expect(verifyOAuthClient(admin.id, documented.id, documented.reviewed)).resolves.toEqual({
      outcome: 'conflict',
    })
    await expect(verifyOAuthClient(admin.id, MISSING_ID, revoked.reviewed)).resolves.toEqual({
      outcome: 'not_found',
    })
    const all = await listedIds('all')
    expect(all).not.toContain(revoked.id)
    expect(all).not.toContain(documented.id)
  })

  it('clears verification', async () => {
    const client = await registerTestClient()
    await verifyOAuthClient(admin.id, client.id, client.reviewed)

    await expect(unverifyOAuthClient(client.id)).resolves.toBe(true)
    await expect(listedIds('unverified')).resolves.toContain(client.id)
    await expect(unverifyOAuthClient(MISSING_ID)).resolves.toBe(false)
  })

  it('pages clients newest first', async () => {
    await registerTestClient()
    await registerTestClient()

    const page = await listOAuthClientsForVerification({ verification: 'all', limit: 1 })
    expect(page.hasNextPage).toBe(true)
    const next = await listOAuthClientsForVerification({
      verification: 'all',
      limit: 1,
      afterId: page.results[0]!.id,
    })
    expect(next.results[0]!.id.localeCompare(page.results[0]!.id)).toBeLessThan(0)
  })
})
