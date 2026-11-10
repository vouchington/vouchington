import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAccountRaw,
  getOAuthAccountUnlinkedAt,
  insertTestOAuthAccount,
  restoreUser,
  softDeleteUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { connectOAuthAccountToUser } from './connect.mts'
import { upsertOAuthAccount } from './upsert.mts'

describe('connectOAuthAccountToUser', () => {
  it.each(['apple', 'google', 'linkedin', 'microsoft'] as const)(
    'keeps the generic %s linkage trigger valid without friend-work columns',
    async provider => {
      const user = await createTestUser()
      const providerUserId = `${provider}-link-${randomUUID()}`
      await insertTestOAuthAccount(provider, providerUserId)
      await connectOAuthAccountToUser(provider, user.id, providerUserId)
      expect(await getTestOAuthAccountRaw(provider, providerUserId)).toMatchObject({
        user_id: user.id,
      })
      expect(await getOAuthAccountUnlinkedAt(provider, providerUserId)).toBeNull()
    },
  )

  it('rechecks suspension after provider work and leaves the account unlinked', async () => {
    const user = await createTestUser()
    const providerUserId = `github-suspended-${randomUUID()}`
    await upsertOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`, {
      login: providerUserId,
    })
    try {
      await suspendTestUser(user.id)
      await expect(
        connectOAuthAccountToUser('github', user.id, providerUserId),
      ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' })
      expect(await getTestOAuthAccountRaw('github', providerUserId)).toMatchObject({
        user_id: null,
      })
    } finally {
      await unsuspendTestUser(user.id)
    }
  })

  it.each(['github', 'google'] as const)(
    'throws 409 when the %s account belongs to another user and preserves its owner',
    async provider => {
      const userA = await createTestUser()
      const userB = await createTestUser()
      const providerUserId = `${provider}-connect-${randomUUID()}`
      onTestFinished(() =>
        deleteTestOAuthAuthorizationFixtures({
          ...(provider === 'github'
            ? { githubUserIds: [providerUserId] }
            : { googleUserIds: [providerUserId] }),
          userIds: [userA.id, userB.id],
        }),
      )
      await upsertOAuthAccount(provider, providerUserId, `tests+${providerUserId}@voucha.ai`, {
        login: providerUserId,
      })

      await connectOAuthAccountToUser(provider, userA.id, providerUserId)

      await expect(
        connectOAuthAccountToUser(provider, userB.id, providerUserId),
      ).rejects.toMatchObject({ status: 409 })
      await expect(getTestOAuthAccountRaw(provider, providerUserId)).resolves.toMatchObject({
        user_id: userA.id,
      })
    },
  )

  it('throws 404 when the provider account does not exist', async () => {
    const user = await createTestUser()
    await expect(
      connectOAuthAccountToUser('github', user!.id, `github-missing-${randomUUID()}`),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('does not attach an OAuth account to a deleted user', async () => {
    const user = await createTestUser()
    const providerUserId = `github-deleted-${randomUUID()}`
    await upsertOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`, {
      login: providerUserId,
    })
    try {
      await softDeleteUser(user.id)

      await expect(
        connectOAuthAccountToUser('github', user.id, providerUserId),
      ).rejects.toMatchObject({ status: 404 })
      await expect(getTestOAuthAccountRaw('github', providerUserId)).resolves.toMatchObject({
        user_id: null,
      })
    } finally {
      await restoreUser(user.id)
    }
  })
})
