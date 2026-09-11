import { describe, expect, it } from 'vitest'

import { createTopicAliases } from '@services/topics/aliases'
import {
  clearTestRssFeedItemCategoryTopicAlias,
  createTestTopic,
  getTestPostPublicationDirtyWorkForScope,
  getTopicAliasIdForTest,
  insertTestRssFeedDirect,
  listTestPostPublicationImpactTopicIds,
} from '@voucha/test-helpers'
import {
  getRssFeedItemCategories,
  getRssFeedItemMappedTopics,
  upsertRssFeedItemCategories,
} from '../categories.mts'
import { upsertRssFeedItems } from '../upsert.mts'

describe('RSS feed item ordinary category aliases', () => {
  it('maps a mixed-case category through a non-hashtag topic alias', async () => {
    const suffix = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Ordinary category topic ${suffix}`,
      slug: `ordinary-category-topic-${suffix}`,
      hostname: `ordinary-category-${suffix}.example.com`,
    })
    const alias = `software product ${suffix}`
    await createTopicAliases(topic.id, alias)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://ordinary-category-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `Ordinary category feed ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://ordinary-category-${suffix}.example.com/item`,
        guid: `ordinary-category-item-${suffix}`,
        title: `Ordinary category item ${suffix}`,
      },
    ])
    const category = alias.toUpperCase()
    const before = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })

    await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: [category] }])

    const after = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    expect(Number(after!.generation)).toBeGreaterThan(Number(before!.generation))
    expect(after!.reasons).toContain('post_topics_changed')
    await expect(listTestPostPublicationImpactTopicIds(after!.id)).resolves.toContain(topic.id)

    await expect(getRssFeedItemCategories(item.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_text: category, topic_id: topic.id }),
      ]),
    )
    await expect(getRssFeedItemMappedTopics(item.id, 10)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: topic.id })]),
    )
  })

  it('captures a category that gains an alias without changing topics', async () => {
    const suffix = Math.random().toString(36).slice(2, 15)
    const alias = `alias-only-${suffix}`
    const category = `#${alias}`
    const topic = await createTestTopic({
      name: category,
      slug: `alias-only-category-${suffix}`,
      hostname: `alias-only-category-${suffix}.example.com`,
    })
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://alias-only-category-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `Alias-only category feed ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://alias-only-category-${suffix}.example.com/item`,
        guid: `alias-only-category-item-${suffix}`,
        title: `Alias-only category item ${suffix}`,
      },
    ])
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: [category] }])
    await clearTestRssFeedItemCategoryTopicAlias(item.id, category)
    await createTopicAliases(topic.id, alias)
    const aliasId = (await getTopicAliasIdForTest(alias))!
    const before = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId,
    })

    await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: [category] }])

    const after = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId,
    })
    expect(Number(after!.generation)).toBeGreaterThan(Number(before!.generation))
    expect(after!.reasons).toContain('post_topics_changed')
  })
})
