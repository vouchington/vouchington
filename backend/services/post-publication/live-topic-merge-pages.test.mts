import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  insertTestRssFeedDirect,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { insertTestRssFeedItemSourceBatch } from '../../test-helpers/entities/publication-impact-batches.mts'
import { registerTestRssCategoryIdentity } from '../../test-helpers/entities/rss-category-identities.mts'
import {
  insertTestLiveRssFeedCategories,
  insertTestLiveRssItemCategories,
} from '../../test-helpers/publication-test-queries.mts'
import {
  listLiveTopicMergeFeedsPage,
  listLiveTopicMergeItemsPage,
} from './live-topic-merge-pages.mts'
import { postPublicationWorkConfig } from './work-limits.mts'

describe('topic merge category owner pages', () => {
  it.each(['feeds', 'items'] as const)(
    'deduplicates %s before deciding whether a page is complete',
    async kind => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 2 }),
      )
      const topic = await createTestTopic({
        hostname: `merge-category-${randomUUID()}.example.com`,
      })
      const feeds = await Promise.all(
        Array.from({ length: kind === 'feeds' ? 3 : 1 }, () => insertTestRssFeedDirect({})),
      )
      const ids = (
        kind === 'feeds'
          ? feeds.map(feed => feed.id)
          : await insertTestRssFeedItemSourceBatch({
              count: 3,
              rssFeedId: feeds[0]!.id,
              urlId: feeds[0]!.rss_feed_url_id,
            })
      ).toSorted()
      const categories = await Promise.all(
        [0, 1].map(index =>
          registerTestRssCategoryIdentity(`merge-owner-${index}-${randomUUID()}`),
        ),
      )
      const insert =
        kind === 'feeds' ? insertTestLiveRssFeedCategories : insertTestLiveRssItemCategories
      await insert(ids[0]!, topic.id, categories)
      await Promise.all(ids.slice(1).map(id => insert(id, topic.id, [categories[0]!])))
      const read = kind === 'feeds' ? listLiveTopicMergeFeedsPage : listLiveTopicMergeItemsPage
      const direct = await read(topic.id, null)
      expect(direct.ids).toEqual([])
      expect(direct.cursor).not.toBeNull()
      const duplicatePage = await read(topic.id, direct.cursor)
      expect(duplicatePage.ids).toEqual(ids.slice(0, 1))
      expect(duplicatePage.cursor).not.toBeNull()
      const remaining = await read(topic.id, duplicatePage.cursor)
      expect(remaining.ids).toEqual(ids.slice(1))
      expect(remaining.cursor).not.toBeNull()
      expect(await read(topic.id, remaining.cursor)).toEqual({ ids: [], cursor: null })
    },
  )
})
