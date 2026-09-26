import { it, expect, beforeEach, describe } from 'vitest'

import {
  upsertRssFeedItemCategories,
  backfillCategoriesForTopicAliases,
  getRssFeedItemCategories,
  getRssFeedItemMappedTopics,
} from '../categories.mts'

import { createTopicAliases, linkTopicAlias, unlinkTopicAlias } from '@services/topics/aliases'

import { upsertRssFeedItems } from '../upsert.mts'

import { caches } from '@services/entity-cache/caches'

import { getRssFeedItemById } from '../get.mts'
import { searchRssFeedItems } from '../search.mts'

import { v4 as uuid } from 'uuid'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/rss-feed-items, so importing entity-fetch's cached getter back into
// rss-feed-items would create a fresh rss-feed-items<->entity-fetch cycle. Same cache
// instance/TTL/invalidation-keys as entity-fetch's getRssFeedItemByIdCached.
const getRssFeedItemByIdCached = caches.rss_feed_items.cacheGetByAny(getRssFeedItemById)

import {
  createTestTopic,
  createTestUser,
  getTopicAliasIdForTest,
  getEntityRelation,
  softDeleteTopic,
  insertTestRssFeedDirect,
  setTestEntityRelationIdAndScore,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'

import { createTopic } from '@services/topics'

describe('categories relations', () => {
  let testTopicId: string

  let testRssFeedItemId: string

  let testAlias: string

  beforeEach(async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Relation Test Topic ${random}`,
      slug: `relation-test-topic-${random}`,
      hostname: `relations-${random}.example.com`,
    })
    testTopicId = topic.id
    testAlias = `relation-alias-${random}`
    await createTopicAliases(testTopicId, [testAlias])

    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://relations-${random}.example.com/feed.xml`,
      topicId: testTopicId,
      title: `Relation Test Feed ${random}`,
    })
    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://test-${uuid()}.example.com/rel-item`,
        guid: `rel-item-${uuid()}`,
        title: 'Relation Test Item',
        categories: [testAlias],
      },
    ])
    testRssFeedItemId = items[0].id
  })

  it('getRssFeedItemMappedTopics returns topics resolved from category aliases', async () => {
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [testAlias] },
    ])

    const topics = await getRssFeedItemMappedTopics(testRssFeedItemId, 10)
    expect(topics.some(t => t.id === testTopicId)).toBe(true)
  })

  it('getRssFeedItemMappedTopics returns empty array when no categories are resolved', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    // Insert a category that has no topic match
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [`unmatched-${random}`] },
    ])

    const topics = await getRssFeedItemMappedTopics(testRssFeedItemId, 10)
    // No topic resolved for the unmatched category
    expect(topics.some(t => t.id === testTopicId)).toBe(false)
  })

  it('upsertRssFeedItemCategories creates a category relation chip visible in the view', async () => {
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [testAlias] },
    ])

    // Relation vote stats are refreshed before cache invalidation, so the view has a topic chip
    // immediately after the upsert resolves.
    const projected = await getRssFeedItemById(testRssFeedItemId)
    expect(projected?.categories?.some(c => c.topic?.id === testTopicId)).toBe(true)

    // The view aggregates relations with votes_score_net > 0 as topic chips.
    // A freshly-created relation from the rss-feed-categorizer user (vote_weight=0.01)
    // should appear in the view since 0.01 > 0. Read through the cached getter too.
    const item = await getRssFeedItemByIdCached(testRssFeedItemId)
    const topicChip = item?.categories?.find(c => c.topic?.id === testTopicId)
    expect(topicChip).toBeDefined()
    expect(topicChip?.topic?.id).toBe(testTopicId)
    expect(topicChip?.hashtag).toEqual(
      expect.objectContaining({
        key: testAlias,
        display_token: testAlias,
        topic_id: testTopicId,
      }),
    )
  })

  it('keeps a positive hashtag visible when its mapped topic relation becomes nonpositive', async () => {
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [testAlias] },
    ])
    await expect
      .poll(async () => {
        const item = await getRssFeedItemById(testRssFeedItemId)
        return item?.categories?.some(category => category.topic?.id === testTopicId)
      })
      .toBe(true)
    const [topicRelation] = (await getEntityRelation(
      'relation__rss_feed_item__category__topic',
      testRssFeedItemId,
      testTopicId,
    )) as Array<{ id: string }>
    await setTestEntityRelationIdAndScore(
      'relation__rss_feed_item__category__topic',
      testRssFeedItemId,
      testTopicId,
      topicRelation!.id,
      0,
    )

    const item = await getRssFeedItemById(testRssFeedItemId)
    expect(item?.categories?.some(category => category.topic?.id === testTopicId)).toBe(false)
    expect(item?.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category_text: testAlias,
          topic: null,
          hashtag: expect.objectContaining({ key: testAlias, topic_id: testTopicId }),
        }),
      ]),
    )
  })

  it('creates and relates a canonical alias for a valid RSS hashtag without changing its display casing', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const authored = `#Fresh.Tag_${random.toUpperCase()}`
    const canonical = `fresh-tag-${random}`

    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [authored] },
    ])

    const categories = await getRssFeedItemCategories(testRssFeedItemId)
    expect(categories).toEqual(
      expect.arrayContaining([expect.objectContaining({ category_text: authored })]),
    )
    const aliasId = await getTopicAliasIdForTest(canonical)
    expect(aliasId).not.toBeNull()

    await expect
      .poll(async () => {
        const result = await searchRssFeedItems({ hashtag_alias_ids: [aliasId!] })
        return result.results.some(item => item.id === testRssFeedItemId)
      })
      .toBe(true)
  })

  it('backfillCategoriesForTopicAliases creates relation for backfilled items', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const categoryText = `backfill-rel-${random}`

    // Insert unresolved category
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [categoryText] },
    ])

    // Before backfill: no relation for this topic
    let mappedTopics = await getRssFeedItemMappedTopics(testRssFeedItemId, 10)
    const user = await createTestUser({ administrator: true })
    const backfillTopic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Backfill Rel Topic ${random}`,
      slug: `backfill-rel-topic-${random}`,
    })
    await createTopicAliases(backfillTopic.id, [categoryText])

    // After backfill: topic should now be mapped
    await backfillCategoriesForTopicAliases(backfillTopic.id)
    mappedTopics = await getRssFeedItemMappedTopics(testRssFeedItemId, 10)
    expect(mappedTopics.some(t => t.id === backfillTopic.id)).toBe(true)
  })

  it('backfills a hashtag-prefixed category through its canonical alias identity', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const authored = `#Backfill.Tag_${random}`
    const canonical = `backfill-tag-${random}`
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [authored] },
    ])
    const aliasId = await getTopicAliasIdForTest(canonical)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Hashtag Backfill ${random}`,
      slug: `hashtag-backfill-${random}`,
    })
    await linkTopicAlias(topic.id, aliasId!, { skipSideEffects: true })

    await expect(backfillCategoriesForTopicAliases(topic.id)).resolves.toMatchObject({ updated: 1 })
    await expect(getRssFeedItemCategories(testRssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_text: authored, topic_id: topic.id }),
      ]),
    )
  })

  it('retires the prior direct topic relation when a hashtag alias moves', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const authored = `#Moved_${random}`
    const canonical = `moved-${random}`
    const user = await createTestUser({ administrator: true })
    const originalTopic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Original Hashtag Topic ${random}`,
      slug: `original-hashtag-topic-${random}`,
    })
    const destinationTopic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Destination Hashtag Topic ${random}`,
      slug: `destination-hashtag-topic-${random}`,
    })
    const [alias] = await createTopicAliases(originalTopic.id, canonical)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [authored] },
    ])
    await unlinkTopicAlias(alias!.id, { expectedTopicId: originalTopic.id, skipSideEffects: true })
    await linkTopicAlias(destinationTopic.id, alias!.id, { skipSideEffects: true })

    await backfillCategoriesForTopicAliases(destinationTopic.id)
    const mappedTopics = await getRssFeedItemMappedTopics(testRssFeedItemId, 10)
    expect(mappedTopics.map(topic => topic.id)).toContain(destinationTopic.id)
    expect(mappedTopics.map(topic => topic.id)).not.toContain(originalTopic.id)
  })

  it('upsertRssFeedItemCategories updates null-topic category and creates relation', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const unmatchedCategory = `update-test-${random}`

    // First upsert: category inserts with topic_id=null (no alias yet)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [unmatchedCategory] },
    ])

    // Create a topic with the category text as an alias
    const user = await createTestUser({ administrator: true })
    const newTopic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Update Rel Topic ${random}`,
      slug: `update-rel-topic-${random}`,
    })
    await createTopicAliases(newTopic.id, [unmatchedCategory])

    // Second upsert: hits the toUpdate branch (exists=true, existing_topic_id=null, new_topic_id=newTopic.id)
    // and pushes to resolvedTopicPairs (line 88), which creates a category relation
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: testRssFeedItemId, categories: [unmatchedCategory] },
    ])

    // The relation should now exist (topic was mapped and relation created)
    const mappedTopics = await getRssFeedItemMappedTopics(testRssFeedItemId, 10)
    expect(mappedTopics.some(t => t.id === newTopic.id)).toBe(true)
  })

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof softDeleteTopic)
})
