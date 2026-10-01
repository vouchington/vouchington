import { beforeAll, afterEach, afterAll } from 'vitest'
import type { PrivateUser } from '../services/users/types.mts'
import {
  deleteUserBookmarkBloomFilter,
  getUserBookmarkRelationsForEntityType,
} from '../services/bookmarks/bloom-filter.mts'
import { bloomFilterConfig } from '../services/bloom-filter-config/index.mts'
import { bloomFilters as bloomFiltersWorker } from '../workers/bloom-filters/workers.mts'
import { overrideDynamicConfigFieldsForTest, createTestUser } from './index.mts'

export function registerBookmarkBloomFixture() {
  let user: PrivateUser
  let createdUserId: string | undefined
  let topicFollowRelationTableName: string
  let rssFeedItemSaveRelationTableName: string
  let restoreBloomFilterConfig: (() => void) | undefined

  beforeAll(async () => {
    await bloomFilterConfig.waitForInitialization()
    // globalSetup disables bloom filter for non-bloom tests. Re-enable it here
    // so this test suite exercises the bloom code paths.
    restoreBloomFilterConfig = overrideDynamicConfigFieldsForTest(bloomFilterConfig, {
      bookmarkBloomFilterEnabled: true,
    })

    const createdUser = await createTestUser()
    if (!createdUser) throw new Error('Failed to create test user')
    user = createdUser
    createdUserId = createdUser.id

    const topicRelation = getUserBookmarkRelationsForEntityType('topic').find(
      relationData => relationData.predicate === 'follow',
    )
    if (!topicRelation) throw new Error('Missing user->follow->topic relation metadata')
    topicFollowRelationTableName = topicRelation.table_name

    const rssRelation = getUserBookmarkRelationsForEntityType('rss_feed_item').find(
      relationData => relationData.predicate === 'save',
    )
    if (!rssRelation) throw new Error('Missing user->save->rss_feed_item relation metadata')
    rssFeedItemSaveRelationTableName = rssRelation.table_name
  })

  afterEach(async () => {
    if (!createdUserId) return
    overrideDynamicConfigFieldsForTest(bloomFilterConfig, { bookmarkBloomFilterEnabled: true })
    // Wait for any in-flight bloom filter jobs to finish before deleting the filter.
    // getBookmarksForEntities enqueues a backfill job when the filter is unready; that job runs
    // asynchronously via the TestWorker and can race with the next test's explicit backfill call.
    // Draining here ensures no concurrent rebuildFromStream calls interfere across tests.
    const worker = bloomFiltersWorker as unknown as {
      getActiveCount(): number
      once(event: string, cb: () => void): void
    }
    if (worker.getActiveCount() > 0) {
      await new Promise<void>(resolve => worker.once('drained', resolve))
    }
    await deleteUserBookmarkBloomFilter(createdUserId).catch(() => {})
  })

  afterAll(async () => {
    try {
      if (createdUserId) await deleteUserBookmarkBloomFilter(createdUserId).catch(() => {})
    } finally {
      restoreBloomFilterConfig?.()
    }
  })
  return {
    get user() {
      return user
    },
    get topicFollowRelationTableName() {
      return topicFollowRelationTableName
    },
    get rssFeedItemSaveRelationTableName() {
      return rssFeedItemSaveRelationTableName
    },
  }
}
