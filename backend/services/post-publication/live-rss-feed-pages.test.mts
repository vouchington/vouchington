import {
  insertTestLiveRssFeedCategories,
  insertTestLiveRssItemCategories,
  countTestFeedSources,
} from '../../test-helpers/publication-test-queries.mts'
import {
  createRandomString,
  createTestTopic,
  createTestUser,
  insertTestUrlDirect,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestRssFeedItemSourceBatch } from '@voucha/test-helpers/entities/publication-impact-batches'
import { registerTestRssCategoryIdentity } from '@voucha/test-helpers/entities/rss-category-identities'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  listLiveFeedCategoriesPage,
  listLiveFeedItemsPage,
  listLiveItemCategoriesPage,
} from './live-rss-feed-pages.mts'
import { postPublicationWorkConfig } from './work-limits.mts'

describe('live RSS publication identity pages', () => {
  it('pages source items and feed and item categories by indexed identity', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: 2,
    })
    onTestFinished(restore)
    const suffix = createRandomString(10)
    const user = await createTestUser()
    const topic = await createTestTopic({ user, hostname: `live-rss-${suffix}.example.com` })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const url = await insertTestUrlDirect(user.id, `https://live-rss-${suffix}.example.com/item`)
    if (!url) throw new Error('Expected RSS item URL')
    const itemIds = (
      await insertTestRssFeedItemSourceBatch({
        count: 3,
        rssFeedId: feed.id,
        urlId: url.id,
      })
    ).toSorted()
    const categoryIds = await Promise.all(
      [0, 1, 2].map(index => registerTestRssCategoryIdentity(`live-rss-${suffix}-${index}`)),
    )
    await insertTestLiveRssFeedCategories(feed.id, topic.id, categoryIds)
    await insertTestLiveRssItemCategories(itemIds[0]!, topic.id, categoryIds)

    const sourceFirst = await listLiveFeedItemsPage(feed.id, null)
    const sourceSecond = await listLiveFeedItemsPage(feed.id, sourceFirst.cursor)
    expect(sourceFirst).toEqual({ itemIds: itemIds.slice(0, 2), postIds: [], cursor: itemIds[1] })
    expect(sourceSecond).toEqual({ itemIds: itemIds.slice(2), postIds: [], cursor: null })

    const orderedCategories = categoryIds.toSorted()
    const feedFirst = await listLiveFeedCategoriesPage(feed.id, null)
    const feedSecond = await listLiveFeedCategoriesPage(feed.id, feedFirst.cursor)
    expect(feedFirst).toEqual({ topicIds: [topic.id, topic.id], cursor: orderedCategories[1] })
    expect(feedSecond).toEqual({ topicIds: [topic.id], cursor: null })

    const itemFirst = await listLiveItemCategoriesPage(itemIds[0]!, null)
    const itemSecond = await listLiveItemCategoriesPage(itemIds[0]!, itemFirst.cursor)
    expect(itemFirst).toEqual({ topicIds: [topic.id], aliases: [], cursor: orderedCategories[1] })
    expect(itemSecond).toEqual({ topicIds: [topic.id], aliases: [], cursor: null })
    expect(await countTestFeedSources(feed.id)).toBe(3)
  })
})
