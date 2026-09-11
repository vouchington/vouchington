import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  getTestOAuthAccountRaw,
  lockTestUserMutation,
  restoreUser,
  softDeleteTestUserAndWaitBeforeCommit,
  softDeleteUser,
} from '@voucha/test-helpers'
import {
  connectOAuthAccountToUser,
  runOAuthAccountConnectionPostCommitEffects,
} from './connect.mts'
import { upsertOAuthAccount } from './upsert.mts'

describe('connectOAuthAccountToUser', () => {
  it('throws 409 when the provider account belongs to another user', async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()
    const providerUserId = `github-connect-${randomUUID()}`
    await upsertOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`, {
      login: providerUserId,
    })

    await connectOAuthAccountToUser('github', userA!.id, providerUserId)

    await expect(
      connectOAuthAccountToUser('github', userB!.id, providerUserId),
    ).rejects.toMatchObject({ status: 409 })
  })

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
    let connecting: Promise<void> | undefined

    try {
      deleting = softDeleteTestUserAndWaitBeforeCommit(
        user.id,
        releaseDeletion.promise,
        deletionUpdated.resolve,
        query => lockTestUserMutation(query, user.id),
      )
      await deletionUpdated.promise

      connecting = connectOAuthAccountToUser('github', user.id, providerUserId)
      await new Promise<void>(resolve => setImmediate(resolve))
      releaseDeletion.resolve()

      await expect(deleting).resolves.toBeUndefined()
      await expect(connecting).rejects.toMatchObject({ code: '23514' })
      await expect(getTestOAuthAccountRaw('github', providerUserId)).resolves.toMatchObject({
        user_id: null,
      })
    } finally {
      releaseDeletion.resolve()
      await deleting?.catch(() => undefined)
      await connecting?.catch(() => undefined)
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
