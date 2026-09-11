import { describe, expect, it, vi } from 'vitest'

import {
  beginTransaction,
  createTestRetentionWindow,
  createTestUserDirect,
  getTestPostPublicationDirtyWorkForScope,
  getTestUserRaw,
  insertTestPost,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'

import { cleanupSoftDeletedUsers } from '../cleanup.mts'

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
      await query(
        `/* cleanup retention transaction boundary */ SELECT id FROM posts WHERE id = $1::uuid FOR UPDATE`,
        [secondPostId],
      )
      secondPostLocked.resolve()
      await releaseSecondPost.promise

      await query.commit()
    }
    await secondPostLocked.promise

    const cleanup = cleanupSoftDeletedUsers({ ...window, batchSize: 2, maxBatches: 1 })
    try {
      await vi.waitFor(async () => {
        expect(await getTestUserRaw(firstUser.id)).toBeNull()
        expect(
          await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: firstUser.id }),
        ).toMatchObject({ reasons: expect.arrayContaining(['author_deleted']) })
        expect(await getTestUserRaw(secondUser.id)).not.toBeNull()
      })
    } finally {
      releaseSecondPost.resolve()
    }
    await holder
    await expect(cleanup).resolves.toEqual({ deleted: 2, hasMore: true })
    expect(await getTestUserRaw(secondUser.id)).toBeNull()
    expect(
      await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: firstPostId }),
    ).toMatchObject({ reasons: expect.arrayContaining(['author_deleted']) })
  }, 60_000)
})
