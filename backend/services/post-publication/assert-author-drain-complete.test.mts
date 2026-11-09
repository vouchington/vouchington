import { beginTransaction, createTestPost, createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { processAuthorDeletionPublicationBatch } from './capture-author-deletion-batch.mts'
import { assertAuthorDeletionDrainedPosts } from './assert-author-drain-complete.mts'

describe('assertAuthorDeletionDrainedPosts', () => {
  it('allows finalization after the author drain reassigns every owned post', async () => {
    const user = await createTestUser()
    await createTestPost({ user })

    await using transaction = await beginTransaction()
    const drained = await processAuthorDeletionPublicationBatch(transaction, user.id, null, 2)
    expect(drained).toEqual({ processed: 1, hasMore: false })
    await expect(assertAuthorDeletionDrainedPosts(transaction, user.id)).resolves.toBeUndefined()
  })

  it('rejects even one surviving post instead of traversing and cascading its descendants', async () => {
    const user = await createTestUser()
    await createTestPost({ user })

    await using transaction = await beginTransaction()
    await expect(assertAuthorDeletionDrainedPosts(transaction, user.id)).rejects.toThrow(
      'User still owns posts after the author deletion drain',
    )
  })
})
