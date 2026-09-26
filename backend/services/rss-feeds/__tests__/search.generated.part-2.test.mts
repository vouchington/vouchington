import { it, expect, describe } from 'vitest'

import { createRssFeed } from '../create.mts'

import { searchRssFeeds } from '../search.mts'

import { searchPrimaryEnabledRssFeedIdsByTopicIds } from '../search-by-topic-ids.mts'

import { updateRssFeedById } from '../update.mts'

import {
  createTestTopic,
  createTestUser,
  addRssFeedTopicPublisherTypeWithScore,
  insertEntityRelation,
  insertTestTopicParentRelation,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'

describe('search.generated', () => {
  it('searchRssFeeds filters by text search query', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `text-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Unique Title ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true })

    const results = await searchRssFeeds({ text_search_query: `Unique Title ${random}` })
    const found = results.find(r => r.id === feed.id)
    expect(found).toBeDefined()
  })

  it('searchRssFeeds includes descendant topic feeds when requested', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    const parent = await createTestTopic({ hostname: `parent-${random}.example.com` })
    const child = await createTestTopic({ hostname: `child-${random}.example.com` })
    const other = await createTestTopic({ hostname: `other-${random}.example.com` })

    await insertTestTopicParentRelation({
      childTopicId: child.id,
      parentTopicId: parent.id,
      createdById: user.id,
    })

    const childFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/child-feed-${random}.xml`,
      topic_id: child.id,
      title: `Child Feed ${random}`,
    })
    const otherFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/other-feed-${random}.xml`,
      topic_id: other.id,
      title: `Other Feed ${random}`,
    })

    const results = await searchRssFeeds({
      topic_id: parent.id,
      include_descendants: true,
    })

    expect(results.some(r => r.id === childFeed.id)).toBe(true)
    expect(results.some(r => r.id === otherFeed.id)).toBe(false)
  })

  it('searchRssFeeds requires all ancestor roots for descendant topic_match=all', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    const parent1 = await createTestTopic({ hostname: `parent-1-${random}.example.com` })
    const parent2 = await createTestTopic({ hostname: `parent-2-${random}.example.com` })
    const child = await createTestTopic({ hostname: `shared-child-${random}.example.com` })
    const sibling = await createTestTopic({ hostname: `single-child-${random}.example.com` })

    await insertTestTopicParentRelation({
      childTopicId: child.id,
      parentTopicId: parent1.id,
      createdById: user.id,
    })
    await insertTestTopicParentRelation({
      childTopicId: child.id,
      parentTopicId: parent2.id,
      createdById: user.id,
    })
    await insertTestTopicParentRelation({
      childTopicId: sibling.id,
      parentTopicId: parent1.id,
      createdById: user.id,
    })

    const childFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/shared-child-feed-${random}.xml`,
      topic_id: child.id,
      title: `Shared Child Feed ${random}`,
    })
    const siblingFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/single-child-feed-${random}.xml`,
      topic_id: sibling.id,
      title: `Single Child Feed ${random}`,
    })

    const results = await searchRssFeeds({
      topic_ids: [parent1.id, parent2.id],
      topic_match: 'all',
      include_descendants: true,
    })

    expect(results.some(r => r.id === childFeed.id)).toBe(true)
    expect(results.some(r => r.id === siblingFeed.id)).toBe(false)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof searchPrimaryEnabledRssFeedIdsByTopicIds)
  void (0 as unknown as typeof addRssFeedTopicPublisherTypeWithScore)
  void (0 as unknown as typeof insertEntityRelation)
})
