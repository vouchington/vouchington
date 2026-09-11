import { describe, expect, it } from 'vitest'
import { createTopicAliases } from '@services/topics/aliases'
import { createTestTopic, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { getRssFeedItemById } from '../get.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { upsertRssFeedItemCategories } from '../categories.mts'

describe('RSS feed item category view', () => {
  it('returns every mapped hashtag when aliases share one positive topic relation', async () => {
    const suffix = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Shared hashtag topic ${suffix}`,
      slug: `shared-hashtag-topic-${suffix}`,
      hostname: `shared-hashtag-${suffix}.example.com`,
    })
    const authoredHashtags = [`shared-first-${suffix}`, `shared-second-${suffix}`]
    await createTopicAliases(topic.id, authoredHashtags)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://shared-hashtag-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `Shared hashtag feed ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://shared-hashtag-${suffix}.example.com/item`,
        guid: `shared-hashtag-item-${suffix}`,
        title: `Shared hashtag item ${suffix}`,
        categories: authoredHashtags,
      },
    ])
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: authoredHashtags }])

    await expect
      .poll(async () => {
        const observed = await getRssFeedItemById(item.id)
        return observed?.categories
          ?.filter(category => category.topic?.id === topic.id)
          .flatMap(category => (category.hashtag ? [category.hashtag.key] : []))
          .sort()
      })
      .toEqual(authoredHashtags.toSorted())
  })
})
