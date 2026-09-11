import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
  addCategoryToRssFeedItem,
  addTopicAliasCategoryToRssFeedItem,
  getTopicAliasIdForTest,
  insertTopicAliasForTest,
} from '@voucha/test-helpers'
import { searchRssFeedItems } from '../search.mts'
import { createCategoryRelations } from '../category-relations.mts'

describe('searchRssFeedItems hashtag_topic_ids', () => {
  it('union filter returns items categorized to topic even when feed is owned by a different topic', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)

    // Content topic — has categorized items but no owned feed
    const contentTopicId = await insertTestTopic({
      name: `SF Content Topic ${random}`,
      slug: `sf-content-${random}`,
      createdById: user!.id,
    })

    // Feed owner topic — owns the discoverable feed
    const feedOwnerTopicId = await insertTestTopic({
      name: `SF Feed Owner Topic ${random}`,
      slug: `sf-feed-owner-${random}`,
      createdById: user!.id,
    })

    const feedId = await insertTestRssFeed({
      topicId: feedOwnerTopicId,
      title: `SF Feed ${random}`,
    })

    const { id: itemId } = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(itemId, contentTopicId)
    await createCategoryRelations([{ rss_feed_item_id: itemId, topic_id: contentTopicId }])

    // hashtag_topic_ids matches via category branch (union filter)
    const hashtagResult = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      hashtag_topic_ids: [contentTopicId],
    })
    expect(hashtagResult.results.map(r => r.id)).toContain(itemId)

    // topic_ids alone does NOT match (no feed owned by contentTopicId)
    const topicIdsResult = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      topic_ids: [contentTopicId],
    })
    expect(topicIdsResult.results.map(r => r.id)).not.toContain(itemId)

    // feed-owner topic_ids DOES match (feed is owned by feedOwnerTopicId)
    const feedOwnerResult = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      topic_ids: [feedOwnerTopicId],
    })
    expect(feedOwnerResult.results.map(r => r.id)).toContain(itemId)
  })

  it('AND semantics: item must satisfy all hashtag topic clauses', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)

    const topicAId = await insertTestTopic({
      name: `SF Topic A ${random}`,
      slug: `sf-topic-a-${random}`,
      createdById: user!.id,
    })
    const topicBId = await insertTestTopic({
      name: `SF Topic B ${random}`,
      slug: `sf-topic-b-${random}`,
      createdById: user!.id,
    })
    const feedOwnerTopicId = await insertTestTopic({
      name: `SF Feed Owner ${random}`,
      slug: `sf-feed-owner-${random}`,
      createdById: user!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId: feedOwnerTopicId,
      title: `SF Feed ${random}`,
    })

    // Item categorized to both A and B (distinct category_text to avoid unique constraint)
    const { id: itemBothId } = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(itemBothId, topicAId, 'cat-a')
    await addCategoryToRssFeedItem(itemBothId, topicBId, 'cat-b')
    await createCategoryRelations([
      { rss_feed_item_id: itemBothId, topic_id: topicAId },
      { rss_feed_item_id: itemBothId, topic_id: topicBId },
    ])

    // Item categorized to A only
    const { id: itemAOnlyId } = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(itemAOnlyId, topicAId, 'cat-a')
    await createCategoryRelations([{ rss_feed_item_id: itemAOnlyId, topic_id: topicAId }])

    // Single hashtag: both items returned
    const single = await searchRssFeedItems({ hashtag_topic_ids: [topicAId] })
    expect(single.results.map(r => r.id)).toContain(itemBothId)
    expect(single.results.map(r => r.id)).toContain(itemAOnlyId)

    // Two hashtags (AND): only the item matching both is returned
    const and = await searchRssFeedItems({ hashtag_topic_ids: [topicAId, topicBId] })
    expect(and.results.map(r => r.id)).toContain(itemBothId)
    expect(and.results.map(r => r.id)).not.toContain(itemAOnlyId)
  })

  it('matches a linked topic through its alias and an exact alias only through that alias', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `SF Alias Topic ${random}`,
      slug: `sf-alias-topic-${random}`,
      createdById: user!.id,
    })
    const otherTopicId = await insertTestTopic({
      name: `SF Other Alias Topic ${random}`,
      slug: `sf-other-alias-topic-${random}`,
      createdById: user!.id,
    })
    const alias = `sf-alias-${random}`
    await insertTopicAliasForTest(topicId, alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    expect(aliasId).not.toBeNull()
    const feedId = await insertTestRssFeed({
      topicId: otherTopicId,
      title: `SF Alias Feed ${random}`,
    })
    const { id: aliasItemId } = await createTestRssFeedItemWithUrl(feedId)
    const { id: directItemId } = await createTestRssFeedItemWithUrl(feedId)
    await addTopicAliasCategoryToRssFeedItem(aliasItemId, aliasId!, 'alias-category')
    await addCategoryToRssFeedItem(directItemId, topicId, 'direct-category')
    await createCategoryRelations(
      [{ rss_feed_item_id: directItemId, topic_id: topicId }],
      [{ rss_feed_item_id: aliasItemId, topic_alias_id: aliasId! }],
    )

    const linked = await searchRssFeedItems({ hashtag_topic_ids: [topicId] })
    expect(linked.results.map(result => result.id)).toEqual(
      expect.arrayContaining([aliasItemId, directItemId]),
    )

    const exact = await searchRssFeedItems({ hashtag_alias_ids: [aliasId!] })
    expect(exact.results.map(result => result.id)).toContain(aliasItemId)
    expect(exact.results.map(result => result.id)).not.toContain(directItemId)
  })
})
