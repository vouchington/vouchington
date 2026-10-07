import {
  readStaffActionHistory,
  readStaffActionTarget,
  withRejectedStaffActionHistory,
} from '@voucha/test-helpers/staff-action-history'
import { randomBytes } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  getTestOAuthClientRowId,
  revokeTestOAuthClient,
  setTestOAuthClientMetadataUrl,
} from '@voucha/test-helpers/entities/oauth-client-management'
import {
  randomTestOAuthRedirectUri,
  TEST_OAUTH_SCOPE,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
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

async function listedIds(
  verification: OAuthClientVerificationFilter,
  limit = 100,
): Promise<string[]> {
  const page = await listOAuthClientsForVerification({ verification, limit })
  return page.results.map(client => client.id)
}

describe('staff OAuth client verification', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createTestUserDirect()
  })

  it.each(['verify', 'unverify'] as const)(
    'atomically audits OAuth %s with the reviewed identity',
    async action => {
      const actor = await createTestUserDirect()
      const client = await registerTestClient()
      if (action === 'unverify') await verifyOAuthClient(admin.id, client.id, client.reviewed)
      const before = await readStaffActionTarget('oauth_client', client.id)
      const mutate = (query?: TransactionQuery) =>
        action === 'verify'
          ? verifyOAuthClient(actor.id, client.id, client.reviewed, { query })
          : unverifyOAuthClient(actor.id, client.id, { query })
      await withRejectedStaffActionHistory(async query => {
        await expect(mutate(query)).rejects.toThrow('staff history rejected for test')
      })
      expect(await readStaffActionTarget('oauth_client', client.id)).toEqual(before)
      expect(await readStaffActionHistory(actor.id)).toEqual([])
      await mutate()
      const history = await readStaffActionHistory(actor.id)
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        action_type: `oauth_client_${action}`,
        oauth_client_id: client.id,
        metadata: { [action === 'verify' ? 'after' : 'before']: client.reviewed },
      })
    },
  )

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
    const revokedVerified = await registerTestClient()
    await verifyOAuthClient(admin.id, revokedVerified.id, revokedVerified.reviewed)
    await revokeTestOAuthClient(revokedVerified.id)
    const documentedVerified = await registerTestClient()
    await verifyOAuthClient(admin.id, documentedVerified.id, documentedVerified.reviewed)
    await setTestOAuthClientMetadataUrl(
      documentedVerified.id,
      `https://example.com/clients/${randomBytes(6).toString('hex')}.json`,
    )
    const revokedUnverified = await registerTestClient()
    await revokeTestOAuthClient(revokedUnverified.id)
    const documentedUnverified = await registerTestClient()
    await setTestOAuthClientMetadataUrl(
      documentedUnverified.id,
      `https://example.com/clients/${randomBytes(6).toString('hex')}.json`,
    )

    await expect(
      verifyOAuthClient(admin.id, revokedVerified.id, revokedVerified.reviewed),
    ).resolves.toEqual({
      outcome: 'conflict',
    })
    await expect(
      verifyOAuthClient(admin.id, documentedVerified.id, documentedVerified.reviewed),
    ).resolves.toEqual({ outcome: 'conflict' })
    await expect(
      verifyOAuthClient(admin.id, MISSING_ID, revokedVerified.reviewed),
    ).resolves.toEqual({
      outcome: 'not_found',
    })
    const all = await listedIds('all', 10_000)
    for (const id of [
      revokedVerified.id,
      documentedVerified.id,
      revokedUnverified.id,
      documentedUnverified.id,
    ])
      expect(all).not.toContain(id)
    const verified = await listedIds('verified', 10_000)
    for (const id of [revokedVerified.id, documentedVerified.id]) expect(verified).not.toContain(id)
    const unverified = await listedIds('unverified', 10_000)
    for (const id of [revokedUnverified.id, documentedUnverified.id]) {
      expect(unverified).not.toContain(id)
    }
  })

  it('clears verification', async () => {
    const client = await registerTestClient()
    await verifyOAuthClient(admin.id, client.id, client.reviewed)

    await expect(unverifyOAuthClient(admin.id, client.id)).resolves.toBe(true)
    await expect(listedIds('unverified')).resolves.toContain(client.id)
    await expect(unverifyOAuthClient(admin.id, MISSING_ID)).resolves.toBe(false)
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

  it('keyset-pages only active verified dynamic clients', async () => {
    const first = await registerTestClient()
    const second = await registerTestClient()
    await verifyOAuthClient(admin.id, first.id, first.reviewed)
    await verifyOAuthClient(admin.id, second.id, second.reviewed)
    const [newer, older] = [first, second].toSorted((left, right) =>
      right.id.localeCompare(left.id),
    )
    const next = await listOAuthClientsForVerification({
      verification: 'verified',
      limit: 1000,
      afterId: newer!.id,
    })
    expect(next.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: older!.id })]),
    )
    expect(next.results).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: newer!.id })]),
    )
    expect(next.results.every(client => client.id.localeCompare(newer!.id) < 0)).toBe(true)
  })
})
