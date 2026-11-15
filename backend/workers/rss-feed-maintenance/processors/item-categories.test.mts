import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { upsertRssFeedCategories, getRssFeedCategories } from '@services/rss-feeds/categories'
import { createTestTopic, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import {
  processBackfillCategoriesForTopicAliases,
  processBackfillRssFeedCategoriesForTopicAlias,
} from './item-categories.mts'

describe('rss feed item category processors', () => {
  it('backfills item categories for a newly created topic', async () => {
    const suffix = randomUUID()
    const slug = `item-${suffix}`
    const feed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(feed.id, [
      { guid: suffix, link: `https://item-${suffix}.example/item`, title: suffix },
    ])
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [slug] }])
    const topic = await createTestTopic({ slug, name: slug })

    const result = await processBackfillCategoriesForTopicAliases({ topicId: topic.id })
    expect(result).toMatchObject({ updated: 1, hasMore: true })
    expect(result.cursor).not.toBeNull()

    const jobs = await rssFeedMaintenance.searchJobs({
      name: 'processBackfillCategoriesForTopicAliases',
      data: { topicId: topic.id },
    })
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toEqual({ topicId: topic.id, cursor: result.cursor })
    expect(
      (await getTestRssFeedItemCategories(item!.id)).find(row => row.category_text === slug)
        ?.topic_id,
    ).toBe(topic.id)
  })

  it('backfills RSS feed categories for a newly created topic', async () => {
    const slug = `feed-${randomUUID()}`
    const feed = await insertTestRssFeedDirect({})
    await upsertRssFeedCategories(feed.id, [slug])
    const topic = await createTestTopic({ slug, name: slug })

    const result = await processBackfillRssFeedCategoriesForTopicAlias({ topicId: topic.id })
    expect(result).toMatchObject({ updated: 1, hasMore: true })
    expect(result.cursor).not.toBeNull()

    const jobs = await rssFeedMaintenance.searchJobs({
      name: 'processBackfillRssFeedCategoriesForTopicAlias',
      data: { topicId: topic.id },
    })
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(jobs.map(job => job.data)).toEqual([{ topicId: topic.id, cursor: result.cursor }])
    expect(
      (await getRssFeedCategories(feed.id)).find(row => row.category_text === slug)?.topic_id,
    ).toBe(topic.id)
  })
})
