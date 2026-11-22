import { describe, expect, it, vi } from 'vitest'
import {
  lockTestPostRow,
  readTestPostCreator,
} from '../../../test-helpers/publication-test-queries.mts'
import { DELETED_USER_ID } from '@services/users/constants'

import {
  beginTransaction,
  createTestRetentionWindow,
  createTestUserDirect,
  getTestUserRaw,
  insertTestPost,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'

import * as cleanupUser from '../cleanup-soft-deleted-user.mts'
import { runDataRetentionCleanup } from '../cleanup.mts'
import {
  areTestUsersDeleted,
  runUserPurgeTicksForTest,
} from '../../../test-helpers/user-purge-ticks.mts'

describe('cleanupSoftDeletedUsers transaction boundaries', () => {
  it('commits each selected user before a later user waits on post capture', async () => {
    const window = createTestRetentionWindow()
    const [firstUser, secondUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!firstUser || !secondUser) throw new Error('Failed to create test users')
    const [firstPostId, secondPostId] = await Promise.all([
      insertTestPost({
        title: 'First retention transaction',
        slug: `first-retention-transaction-${v7()}`,
        markdown: 'First retention transaction',
        createdById: firstUser.id,
      }),
      insertTestPost({
        title: 'Second retention transaction',
        slug: `second-retention-transaction-${v7()}`,
        markdown: 'Second retention transaction',
        createdById: secondUser.id,
      }),
    ])
    await softDeleteUserAt(firstUser.id, window.firstEligibleDate)
    await softDeleteUserAt(secondUser.id, window.secondEligibleDate)

    const secondPostLocked = Promise.withResolvers<void>()
    const releaseSecondPost = Promise.withResolvers<void>()
    const holder = holdSecondPostRowLock()

    async function holdSecondPostRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await lockTestPostRow(query, secondPostId)
      secondPostLocked.resolve()
      await releaseSecondPost.promise

      await query.commit()
    }
    await secondPostLocked.promise

    const cleanupOne = cleanupUser.cleanupSoftDeletedUser
    const firstCommitted = Promise.withResolvers<void>()
    const cleanupSpy = vi
      .spyOn(cleanupUser, 'cleanupSoftDeletedUser')
      .mockImplementation(async (...args) => {
        const result = await cleanupOne(...args)
        if (args[0] === firstUser.id) firstCommitted.resolve()
        return result
      })
    // An unrelated purge can abort the first user's transaction; the next tick then reaches the
    // same held post lock, which is the state under test.
    const cleanup = runUserPurgeTicksForTest(
      () =>
        runDataRetentionCleanup(
          { batchSize: 500, maxBatches: 1 },
          {
            families: ['softDeletedUsers'],
            softDeletedUsers: { ...window, batchSize: 4, maxBatches: 1 },
          },
        ).then(result => result.softDeletedUsers),
      () => areTestUsersDeleted([firstUser.id, secondUser.id]),
    )
    try {
      await firstCommitted.promise
      expect(await getTestUserRaw(firstUser.id)).toBeNull()
      expect(await readTestPostCreator(firstPostId)).toBe(DELETED_USER_ID)
      expect(await getTestUserRaw(secondUser.id)).not.toBeNull()
    } finally {
      releaseSecondPost.resolve()
      cleanupSpy.mockRestore()
    }
    await holder
    const ticks = await cleanup
    expect(ticks.reduce((count, result) => count + result.deleted, 0)).toBe(2)
    expect(ticks.at(-1)?.hasMore).toBe(false)
    expect(await getTestUserRaw(secondUser.id)).toBeNull()
  })
})
