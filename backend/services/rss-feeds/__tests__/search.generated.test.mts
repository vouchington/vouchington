import { it, expect, describe } from 'vitest'

import { createRssFeed } from '../create.mts'

import { upsertRssFeedCategories } from '../categories.mts'

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
  it('searchRssFeeds returns enabled feeds by default', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `search-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    // Enable the feed
    await updateRssFeedById(feed.id, { enabled: true })

    const results = await searchRssFeeds()
    expect(Array.isArray(results)).toBe(true)
    const found = results.find(r => r.id === feed.id)
    expect(found).toBeDefined()
    expect(found!.is_enabled).toBe(true)
  })

  it('searchRssFeeds filters by topic_id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTestTopic({ hostname: `search-1-${random}.example.com` })
    const topic2 = await createTestTopic({ hostname: `search-2-${random}.example.com` })

    const feed1 = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed1-${random}.xml`,
      topic_id: topic1.id,
      title: `Test Feed 1 ${random}`,
    })
    const feed2 = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed2-${random}.xml`,
      topic_id: topic2.id,
      title: `Test Feed 2 ${random}`,
    })
    await updateRssFeedById(feed1.id, { enabled: true })
    await updateRssFeedById(feed2.id, { enabled: true })

    const results = await searchRssFeeds({ topic_id: topic1.id })
    const found = results.find(r => r.id === feed1.id)
    expect(found).toBeDefined()
    const notFound = results.find(r => r.id === feed2.id)
    expect(notFound).toBeUndefined()
  })

  it('searchPrimaryEnabledRssFeedIdsByTopicIds returns enabled feeds for multiple topics', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTestTopic({ hostname: `primary-1-${random}.example.com` })
    const topic2 = await createTestTopic({ hostname: `primary-2-${random}.example.com` })
    const topic3 = await createTestTopic({ hostname: `primary-3-${random}.example.com` })

    const topic1Feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/topic-1-primary-${random}.xml`,
      topic_id: topic1.id,
      title: `Topic 1 Primary ${random}`,
    })
    const topic2Feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/topic-2-primary-${random}.xml`,
      topic_id: topic2.id,
      title: `Topic 2 Primary ${random}`,
    })
    const disabledFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/disabled-primary-${random}.xml`,
      topic_id: topic3.id,
      title: `Disabled Primary ${random}`,
    })
    await updateRssFeedById(topic1Feed.id, { enabled: true })
    await updateRssFeedById(topic2Feed.id, { enabled: true })
    await updateRssFeedById(disabledFeed.id, { enabled: false })

    const results = await searchPrimaryEnabledRssFeedIdsByTopicIds([
      topic1.id,
      topic2.id,
      topic3.id,
    ])

    expect(results).toContain(topic1Feed.id)
    expect(results).toContain(topic2Feed.id)
    expect(results).not.toContain(disabledFeed.id)
  })

  it('searchRssFeeds filters disabled feeds when enabled=false', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `disabled-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: false })

    const results = await searchRssFeeds({ enabled: false })
    const found = results.find(r => r.id === feed.id)
    expect(found).toBeDefined()
    expect(found!.is_enabled).toBe(false)
  })

  it('searchRssFeeds returns all feeds when enabled=null', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTestTopic({ hostname: `all-1-${random}.example.com` })
    const topic2 = await createTestTopic({ hostname: `all-2-${random}.example.com` })

    const feed1 = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed1-${random}.xml`,
      topic_id: topic1.id,
      title: `Test Feed 1 ${random}`,
    })
    const feed2 = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed2-${random}.xml`,
      topic_id: topic2.id,
      title: `Test Feed 2 ${random}`,
    })
    await updateRssFeedById(feed1.id, { enabled: true })
    await updateRssFeedById(feed2.id, { enabled: false })

    const results = await searchRssFeeds({ enabled: null })
    const found1 = results.find(r => r.id === feed1.id)
    const found2 = results.find(r => r.id === feed2.id)
    expect(found1).toBeDefined()
    expect(found2).toBeDefined()
  })

  it('searchRssFeeds filters undiscoverable feeds when requested', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `hidden-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Hidden Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true, discoverable: false })

    const discoverableResults = await searchRssFeeds({ topic_id: topic.id, discoverable: true })
    expect(discoverableResults.find(r => r.id === feed.id)).toBeUndefined()

    const allResults = await searchRssFeeds({ topic_id: topic.id })
    expect(allResults.find(r => r.id === feed.id)).toBeDefined()
  })

  it('searchRssFeeds only applies publisher type mutes to dominant type', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `dominant-mute-${random}.example.com` })
    const dominantType = await createTestTopic({
      slug: `dominant-publisher-${random}`,
      hostname: `dominant-publisher-${random}.example.com`,
    })
    const mutedType = await createTestTopic({
      slug: `muted-publisher-${random}`,
      hostname: `muted-publisher-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Dominant Mute Feed ${random}`,
    })
    await addRssFeedTopicPublisherTypeWithScore(topic.id, dominantType.id, 2)
    await addRssFeedTopicPublisherTypeWithScore(topic.id, mutedType.id, 1)
    await insertEntityRelation('relation__user__mute__topic', user.id, mutedType.id)

    const results = await searchRssFeeds({ topic_id: topic.id, current_user_id: user.id })
    expect(results.find(r => r.id === feed.id)).toBeDefined()
  })

  it('searchRssFeeds filters by dominant publisher type only', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `dominant-filter-${random}.example.com` })
    const dominantType = await createTestTopic({
      slug: `dominant-filter-publisher-${random}`,
      hostname: `dominant-filter-publisher-${random}.example.com`,
    })
    const secondaryType = await createTestTopic({
      slug: `secondary-filter-publisher-${random}`,
      hostname: `secondary-filter-publisher-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/filter-feed-${random}.xml`,
      topic_id: topic.id,
      title: `Dominant Filter Feed ${random}`,
    })
    await addRssFeedTopicPublisherTypeWithScore(topic.id, dominantType.id, 2)
    await addRssFeedTopicPublisherTypeWithScore(topic.id, secondaryType.id, 1)

    const dominantResults = await searchRssFeeds({ publisher_type_id: dominantType.id })
    expect(dominantResults.find(r => r.id === feed.id)).toBeDefined()

    const secondaryResults = await searchRssFeeds({ publisher_type_id: secondaryType.id })
    expect(secondaryResults.find(r => r.id === feed.id)).toBeUndefined()

    const allResults = await searchRssFeeds({
      publisher_type_ids: [dominantType.id, secondaryType.id],
      publisher_type_match: 'all',
    })
    expect(allResults.find(r => r.id === feed.id)).toBeUndefined()
  })
  it('searchRssFeeds filters by feed_type', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicPodcast = await createTestTopic({ hostname: `podcast-ft-${random}.example.com` })
    const topicArticle = await createTestTopic({ hostname: `article-ft-${random}.example.com` })

    const podcastFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/podcast-ft-${random}.xml`,
      topic_id: topicPodcast.id,
      title: `Podcast Feed ${random}`,
    })
    const articleFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/article-ft-${random}.xml`,
      topic_id: topicArticle.id,
      title: `Article Feed ${random}`,
    })
    await updateRssFeedById(podcastFeed.id, { enabled: true, feed_type: 'podcast' })
    await updateRssFeedById(articleFeed.id, { enabled: true, feed_type: 'article' })

    const results = await searchRssFeeds({ feed_type: 'podcast', enabled: null })
    const found = results.find(r => r.id === podcastFeed.id)
    const notFound = results.find(r => r.id === articleFeed.id)
    expect(found).toBeDefined()
    expect(notFound).toBeUndefined()
  })

  it('searchRssFeeds filters by category_topic_id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `cat-filter-${random}.example.com` })
    // The category slug must match the topic slug so upsertRssFeedCategories resolves the topic_id via slug JOIN
    const categorySlug = `test-cat-${random}`
    const categoryTopic = await createTestTopic({ slug: categorySlug, name: categorySlug })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/cat-feed-${random}.xml`,
      topic_id: topic.id,
      title: `Category Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true })
    // Upsert the category — the service resolves topic_id via the slug JOIN when a topic's slug matches the category text
    await upsertRssFeedCategories(feed.id, [categorySlug])

    const matched = await searchRssFeeds({ category_topic_id: categoryTopic.id, enabled: null })
    expect(matched.find(r => r.id === feed.id)).toBeDefined()

    const unmatched = await searchRssFeeds({
      category_topic_id: '00000000-0000-7000-8000-000000000099',
      enabled: null,
    })
    expect(unmatched.find(r => r.id === feed.id)).toBeUndefined()
  }, 30_000)

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestTopicParentRelation)
})
