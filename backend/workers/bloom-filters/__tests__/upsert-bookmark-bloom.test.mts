import { it, expect, beforeEach, afterEach, describe } from 'vitest'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertUserMuteRelations } from '@services/entity-relations/upsert-user-mutes'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import {
  backfillUserBookmarkBloomFilter,
  deleteUserBookmarkBloomFilter,
} from '@services/bookmarks/bloom-filter'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import { bloomFilters as bloomFiltersWorker } from '../workers.mts'
import { overrideDynamicConfigFieldsForTest, createTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { followRssFeedRelation } from '@services/rss-feeds/create-source-helpers'

describe('upsert-bookmark-bloom', () => {
  beforeEach(async () => {
    await bloomFilterConfig.waitForInitialization()
    overrideDynamicConfigFieldsForTest(bloomFilterConfig, { bookmarkBloomFilterEnabled: true })
  })

  afterEach(async () => {
    const worker = bloomFiltersWorker as unknown as {
      getActiveCount(): number
      once(event: string, cb: () => void): void
    }
    if (worker.getActiveCount() > 0) {
      await new Promise<void>(resolve => worker.once('drained', resolve))
    }
  })

  it('upsertEntityRelation (follow rss_feed) adds entry to ready bloom so bloom-gated read returns it', async () => {
    const user = await createTestUser()
    const feed = await createTestRssFeed({})

    // Backfill marks bloom READY but with no entries (feed was created after backfill runs)
    await backfillUserBookmarkBloomFilter(user.id)

    // This is the path that was broken: upsertEntityRelation bypassed bloom maintenance
    await upsertEntityRelation(user, followRssFeedRelation, { id: user.id }, [{ id: feed.id }])

    // getBookmarksForEntities uses the ready bloom filter — pre-fix it would filter feed out
    const bookmarks = await getBookmarksForEntities(user, 'rss_feed', [feed.id])
    expect(bookmarks[feed.id]?.follow).toBe(true)

    await deleteUserBookmarkBloomFilter(user.id).catch(() => {})
  })

  it('upsertUserMuteRelations adds mute entry to ready bloom so bloom-gated read returns it', async () => {
    const user = await createTestUser()
    const other = await createTestUser()

    // Backfill marks bloom READY with no mute entries
    await backfillUserBookmarkBloomFilter(user.id)

    // This is the path that was broken: upsertUserMuteRelations bypassed bloom maintenance
    await upsertUserMuteRelations(user.id, [other.id])

    // Verify the mute is visible through the bloom-gated read
    const bookmarks = await getBookmarksForEntities(user, 'user', [other.id])
    expect(bookmarks[other.id]?.mute).toBe(true)

    await deleteUserBookmarkBloomFilter(user.id).catch(() => {})
  })
})
