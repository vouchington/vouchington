import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAccountRaw,
  getOAuthAccountUnlinkedAt,
  insertTestOAuthAccount,
  lockTestUserMutation,
  restoreUser,
  softDeleteTestUserAndWaitBeforeCommit,
  softDeleteUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import {
  connectOAuthAccountToUser,
  runOAuthAccountConnectionPostCommitEffects,
} from './connect.mts'
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
      ).rejects.toMatchObject({ code: '23514' })
      await expect(getTestOAuthAccountRaw('github', providerUserId)).resolves.toMatchObject({
        user_id: null,
      })
    } finally {
      await restoreUser(user.id)
    }
  })

  it('waits for an in-flight deletion before attaching an OAuth account', async () => {
    const user = await createTestUser()
    const providerUserId = `github-deletion-race-${randomUUID()}`
    await upsertOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`, {
      login: providerUserId,
    })
    const releaseDeletion = Promise.withResolvers<void>()
    const deletionUpdated = Promise.withResolvers<void>()
    let deleting: Promise<void> | undefined

    try {
      deleting = softDeleteTestUserAndWaitBeforeCommit(
        user.id,
        releaseDeletion.promise,
        deletionUpdated.resolve,
        query => lockTestUserMutation(query, user.id),
      )
      await deletionUpdated.promise

      const pendingConnection = connectOAuthAccountToUser('github', user.id, providerUserId).catch(
        (err: unknown) => err,
      )
      {
        await using contention = await beginTransaction()
        await contention(allowUnannotatedQuery(`SET LOCAL lock_timeout = '50ms'`))
        await expect(
          connectOAuthAccountToUser('github', user.id, providerUserId, { query: contention }),
        ).rejects.toMatchObject({ code: '55P03' })
      }
      releaseDeletion.resolve()

      await expect(deleting).resolves.toBeUndefined()
      await expect(pendingConnection).resolves.toMatchObject({ code: '23514' })
      await expect(getTestOAuthAccountRaw('github', providerUserId)).resolves.toMatchObject({
        user_id: null,
      })
    } finally {
      releaseDeletion.resolve()
      await deleting?.catch(() => undefined)
      await restoreUser(user.id)
    }
  })
})

describe('runOAuthAccountConnectionPostCommitEffects', () => {
  it('reports a non-Error vote-weight failure and continues invalidating email state', async () => {
    const userId = randomUUID()
    const invalidateVerifiedEmail = vi.fn<() => Promise<number>>(() => Promise.resolve(0))
    const reportError = vi.fn<(error: unknown) => void>()

    await runOAuthAccountConnectionPostCommitEffects(userId, {
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Post-commit reporting must normalize non-Error queue failures.
      enqueueVoteWeightRecalculation: (_userId: string) => Promise.reject('queue unavailable'),
      invalidateVerifiedEmail,
      reportError,
    })

    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError.mock.calls[0]![0]).toMatchObject({
      name: 'Error',
      message: 'queue unavailable',
    })
    expect(invalidateVerifiedEmail).toHaveBeenCalledWith(userId)
  })
})
