import { it, expect, describe } from 'vitest'
import { deleteUser } from '@services/users/delete'
import {
  backfillUserBookmarkBloomFilter,
  checkBookmarkBloomCandidates,
  deleteUserBookmarkBloomFilter,
  getUserBookmarkRelationsForEntityType,
} from '@services/bookmarks/bloom-filter'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestTopic,
} from '@voucha/test-helpers'
import { softDeleteUser } from '@voucha/test-helpers/entities/users-lifecycle'

describe('deleteUser bookmark bloom filter cleanup', () => {
  it('deleting a user enqueues processDeleteUserBookmarkBloomFilter, which deletes their bloom filter', async () => {
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

      await deleteUser(user, user)

      // deleteUser enqueues `processDeleteUserBookmarkBloomFilter` fire-and-forget (bare `void`, not
      // awaited — see backend/services/users/delete.mts) so the job is not guaranteed to have run,
      // or even to have been picked up by the worker, the instant deleteUser resolves. We cannot spy
      // on the enqueue call (non-web tests must not mock internal modules — see
      // docs/development/tests.md § Vitest Mock Typing), so assert the real, observable end state
      // instead: poll until the worker has actually processed the job and deleted the filter.
      await expect
        .poll(() => checkBookmarkBloomCandidates(user.id, topicRelation.table_name, [topicId]), {
          timeout: 10_000,
          interval: 100,
        })
        .toMatchObject({ ready: false })
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
