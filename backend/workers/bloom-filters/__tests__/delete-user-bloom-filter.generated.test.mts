import { it, expect, describe } from 'vitest'
import type { Job } from 'glide-mq'
import { bloomFilters } from '../workers.mts'
import { deleteUser } from '@services/users/delete'
import {
  backfillUserBookmarkBloomFilter,
  deleteUserBookmarkBloomFilter,
  getUserBookmarkRelationsForEntityType,
} from '@services/bookmarks/bloom-filter'
import { checkBookmarkBloomCandidates } from '@services/bookmarks/bloom-filter-candidates'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestTopic,
} from '@voucha/test-helpers'
import { softDeleteUser } from '@voucha/test-helpers/entities/users-lifecycle'

describe('deleteUser bookmark bloom filter cleanup', () => {
  it('deleting a user enqueues processDeleteUserBookmarkBloomFilter, which deletes their bloom filter', async ({
    signal,
    onTestFinished,
  }) => {
    await bloomFilterConfig.waitForInitialization()
    const restoreBloomFilterConfig = overrideDynamicConfigFieldsForTest(bloomFilterConfig, {
      bookmarkBloomFilterEnabled: true,
    })

    try {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 12)
      const topicRelation = getUserBookmarkRelationsForEntityType('topic').find(
        relationData => relationData.predicate === 'follow',
      )
      if (!topicRelation) throw new Error('Missing user->follow->topic relation metadata')

      const topicId = await insertTestTopic({
        name: `Bloom Delete User Topic ${random}`,
        slug: `bloom-delete-user-topic-${random}`,
        createdById: user.id,
      })
      await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
      await backfillUserBookmarkBloomFilter(user.id)

      const beforeDelete = await checkBookmarkBloomCandidates(user.id, topicRelation.table_name, [
        topicId,
      ])
      expect(beforeDelete.ready).toBe(true)

      const completion = Promise.withResolvers<void>()
      const completionOutcome = Promise.allSettled([completion.promise] as const)
      const isOwnedDeletion = (job: Job): boolean => {
        return job.name === 'processDeleteUserBookmarkBloomFilter' && job.data.userId === user.id
      }
      const onCompleted = (job: Job): void => {
        if (isOwnedDeletion(job)) completion.resolve()
      }
      const onFailed = (job: Job | undefined, error: Error): void => {
        if (job && isOwnedDeletion(job)) completion.reject(error)
      }
      const onAbort = (): void => {
        completion.reject(signal.reason)
      }
      const cleanup = (): void => {
        bloomFilters.off('completed', onCompleted)
        bloomFilters.off('failed', onFailed)
        signal.removeEventListener('abort', onAbort)
      }
      bloomFilters.on('completed', onCompleted)
      bloomFilters.on('failed', onFailed)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
      onTestFinished(cleanup)
      try {
        signal.throwIfAborted()
        await deleteUser(user, user)
        const [outcome] = await completionOutcome
        if (outcome.status === 'rejected') throw outcome.reason
        const afterDelete = await checkBookmarkBloomCandidates(user.id, topicRelation.table_name, [
          topicId,
        ])
        expect(afterDelete).toMatchObject({ ready: false })
      } finally {
        cleanup()
      }
    } finally {
      restoreBloomFilterConfig()
    }
  })

  it('backfilling a soft-deleted user does not recreate their bloom filter', async () => {
    await bloomFilterConfig.waitForInitialization()
    const restoreBloomFilterConfig = overrideDynamicConfigFieldsForTest(bloomFilterConfig, {
      bookmarkBloomFilterEnabled: true,
    })

    try {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 12)
      const topicRelation = getUserBookmarkRelationsForEntityType('topic').find(
        relationData => relationData.predicate === 'follow',
      )
      if (!topicRelation) throw new Error('Missing user->follow->topic relation metadata')

      const topicId = await insertTestTopic({
        name: `Bloom Backfill Deleted User Topic ${random}`,
        slug: `bloom-backfill-deleted-user-topic-${random}`,
        createdById: user.id,
      })
      await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
      await backfillUserBookmarkBloomFilter(user.id)

      const beforeDelete = await checkBookmarkBloomCandidates(user.id, topicRelation.table_name, [
        topicId,
      ])
      expect(beforeDelete.ready).toBe(true)

      // Soft-delete directly (not deleteUser()), which does not race the fire-and-forget
      // processDeleteUserBookmarkBloomFilter enqueue -- this test asserts the backfill-side fence
      // in isolation, not the delete job's own cleanup (already covered above).
      await softDeleteUser(user.id)

      // Simulate the delete job having already run (or having been lost entirely -- either way,
      // the fence must independently guarantee the filter stays gone).
      await deleteUserBookmarkBloomFilter(user.id)

      // A stray backfill -- e.g. one enqueued moments before the user deleted their account --
      // must not recreate the filter or ready markers for a now-deleted user.
      await backfillUserBookmarkBloomFilter(user.id)

      const afterStrayBackfill = await checkBookmarkBloomCandidates(
        user.id,
        topicRelation.table_name,
        [topicId],
      )
      expect(afterStrayBackfill.ready).toBe(false)
    } finally {
      restoreBloomFilterConfig()
    }
  })
})
