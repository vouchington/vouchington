import { describe, expect, it } from 'vitest'

import {
  createTestUserDirect,
  softDeleteUserAt,
  getTestUserRaw,
  insertTestOAuthAccount,
  setOAuthAccountCreatedAt,
  oauthAccountExistsByProviderUserId,
  createRandomString,
  createTestRetentionWindow,
} from '@voucha/test-helpers'

import { createUserDeletionRequest } from '@services/user-deletions/create'
import { completeUserDeletionForTest } from '@services/user-deletions/lifecycle.test-support'

import { providerTableConfigs } from '@services/oauth/providers'

import {
  cleanupSoftDeletedUsers,
  cleanupOldReferralAttributions,
  cleanupOrphanedOAuthAccounts,
} from '../cleanup.mts'

import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'

describe('retention day validation', () => {
  it('rejects unsafe soft-deleted user retention windows', async () => {
    await expect(cleanupSoftDeletedUsers({ retentionDays: 0 })).rejects.toThrow(
      'retentionDays must be a positive integer',
    )
    await expect(cleanupSoftDeletedUsers({ retentionDays: Infinity })).rejects.toThrow(
      'retentionDays must be a finite integer',
    )
  })

  it('rejects unsafe referral attribution retention windows', async () => {
    await expect(cleanupOldReferralAttributions({ retentionDays: 0 })).rejects.toThrow(
      'retentionDays must be a positive integer',
    )
    await expect(cleanupOldReferralAttributions({ retentionDays: Infinity })).rejects.toThrow(
      'retentionDays must be a finite integer',
    )
  })

  it('rejects unsafe OAuth account retention windows', async () => {
    await expect(cleanupOrphanedOAuthAccounts({ retentionDays: 0 })).rejects.toThrow(
      'retentionDays must be a positive integer',
    )
    await expect(cleanupOrphanedOAuthAccounts({ retentionDays: Infinity })).rejects.toThrow(
      'retentionDays must be a finite integer',
    )
  })
})

describe('cleanupSoftDeletedUsers', () => {
  it('hard-deletes soft-deleted users older than retentionDays', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')

    await softDeleteUserAt(user.id, window.firstEligibleDate)

    const result = await cleanupSoftDeletedUsers(window)

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await getTestUserRaw(user.id)).toBeNull()
  }, 30_000)

  it('does NOT delete recently soft-deleted users', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')

    await softDeleteUserAt(user.id, window.afterUpperBoundDate)

    const result = await cleanupSoftDeletedUsers(window)

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
  }, 30_000)

  it('keeps a retention-eligible user while its durable deletion request is incomplete', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()

    await createUserDeletionRequest(user.id, user.id)
    await softDeleteUserAt(user.id, window.firstEligibleDate)

    await expect(cleanupSoftDeletedUsers(window)).resolves.toEqual({ deleted: 0, hasMore: false })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
  }, 30_000)

  it('hard-deletes retention-eligible users after durable deletion completion and without a request', async () => {
    const window = createTestRetentionWindow()
    const [completedRequestUser, legacyUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const request = await createUserDeletionRequest(
      completedRequestUser.id,
      completedRequestUser.id,
    )
    await completeUserDeletionForTest(request.id)
    await Promise.all([
      softDeleteUserAt(completedRequestUser.id, window.firstEligibleDate),
      softDeleteUserAt(legacyUser.id, window.secondEligibleDate),
    ])

    await expect(cleanupSoftDeletedUsers(window)).resolves.toEqual({ deleted: 2, hasMore: false })
    await expect(getTestUserRaw(completedRequestUser.id)).resolves.toBeNull()
    await expect(getTestUserRaw(legacyUser.id)).resolves.toBeNull()
  }, 30_000)

  it('rejects invalid batch options', async () => {
    await expect(cleanupSoftDeletedUsers({ batchSize: 0 })).rejects.toThrow(
      'batchSize must be a positive integer',
    )
  })

  it('deletes soft-deleted users in bounded batches and continues on repeat runs', async () => {
    const window = createTestRetentionWindow()
    const firstUser = await createTestUserDirect()
    const secondUser = await createTestUserDirect()
    if (!firstUser || !secondUser) throw new Error('Failed to create test users')

    await softDeleteUserAt(firstUser.id, window.firstEligibleDate)
    await softDeleteUserAt(secondUser.id, window.secondEligibleDate)

    const firstResult = await cleanupSoftDeletedUsers({
      ...window,
      batchSize: 1,
      maxBatches: 1,
    })
    const remainingAfterFirstRun = [
      await getTestUserRaw(firstUser.id),
      await getTestUserRaw(secondUser.id),
    ].filter(Boolean)

    const secondResult = await cleanupSoftDeletedUsers({
      ...window,
      batchSize: 1,
      maxBatches: 1,
    })

    expect(firstResult).toEqual({ deleted: 1, hasMore: true })
    expect(remainingAfterFirstRun).toHaveLength(1)
    expect(secondResult).toEqual({ deleted: 1, hasMore: true })
    expect(await getTestUserRaw(firstUser.id)).toBeNull()
    expect(await getTestUserRaw(secondUser.id)).toBeNull()
  }, 60_000)

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestOAuthAccount)
  void (0 as unknown as typeof setOAuthAccountCreatedAt)
  void (0 as unknown as typeof oauthAccountExistsByProviderUserId)
  void (0 as unknown as typeof createRandomString)
  void (0 as unknown as typeof providerTableConfigs)
  void (0 as unknown as typeof cleanupOrphanedOAuthAccounts)
  void (0 as unknown as typeof deleteOrphanedOAuthAccountBatch)
})
