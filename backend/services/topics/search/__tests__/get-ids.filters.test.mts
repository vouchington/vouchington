import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  addSpendingCategoryToTopic,
  insertTestRssFeed,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
} from '@voucha/test-helpers'
import { getTopicIds } from '../get-ids.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-ids (filters)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('filters by spending_category', async () => {
    // Create topics - one with spending category, one without
    const topicWithSpending = await insertTestTopic({
      name: `Topic with Spending ${Math.random()}`,
      slug: `topic-spending-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    await addSpendingCategoryToTopic(topicWithSpending)

    const topicWithoutSpending = await insertTestTopic({
      name: `Topic without Spending ${Math.random()}`,
      slug: `topic-no-spending-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    // Filter for topics with spending category
    const results = await getTopicIds({ spending_category: true })
    expect(results.results.some(r => r.id === topicWithSpending)).toBe(true)
    expect(results.results.some(r => r.id === topicWithoutSpending)).toBe(false)
  })

  it('filters by rss_feed', async () => {
    const marker = `RssFeedFilter${Date.now()}${Math.random().toString(36).slice(2)}`

    // Create topics - one with RSS feed, one without, both share the unique marker
    const topicWithRss = await insertTestTopic({
      name: `${marker} With RSS`,
      slug: `topic-rss-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    await insertTestRssFeed({
      topicId: topicWithRss,
      title: 'Test RSS Feed',
    })

    const topicWithoutRss = await insertTestTopic({
      name: `${marker} Without RSS`,
      slug: `topic-no-rss-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    // Use text_search_query to scope to only the two test topics so the dirty DB
    // doesn't push them beyond the default page limit
    const results = await getTopicIds({ rss_feed: true, text_search_query: marker })
    expect(results.results.some(r => r.id === topicWithRss)).toBe(true)
    expect(results.results.some(r => r.id === topicWithoutRss)).toBe(false)
  })

  it('combines spending_category and topic_types filters', async () => {
    // Create a card topic with spending category
    const cardWithSpending = await insertTestTopic({
      name: `Card with Spending ${Math.random()}`,
      slug: `card-spending-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'card',
    })
    await addSpendingCategoryToTopic(cardWithSpending)

    // Create a card topic without spending category
    const cardWithoutSpending = await insertTestTopic({
      name: `Card without Spending ${Math.random()}`,
      slug: `card-no-spending-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'card',
    })

    // Create a regular topic with spending category
    const topicWithSpending = await insertTestTopic({
      name: `Topic with Spending ${Math.random()}`,
      slug: `topic-spending2-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'topic',
    })
    await addSpendingCategoryToTopic(topicWithSpending)

    // Filter for card topics with spending category
    const results = await getTopicIds({
      topic_types: ['card'],
      spending_category: true,
    })
    expect(results.results.some(r => r.id === cardWithSpending)).toBe(true)
    expect(results.results.some(r => r.id === cardWithoutSpending)).toBe(false)
    expect(results.results.some(r => r.id === topicWithSpending)).toBe(false)
  })

  it('combines rss_feed and text_search filters', async () => {
    const uniqueText = `TestSearchRSS${Math.random()}`

    // Create a topic with RSS feed and matching name
    const topicWithRssAndName = await insertTestTopic({
      name: `${uniqueText} Topic`,
      slug: `rss-search-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    await insertTestRssFeed({
      topicId: topicWithRssAndName,
      title: 'Test RSS Feed 1',
    })

    // Create a topic with RSS feed but no matching name
    const topicWithRssOnly = await insertTestTopic({
      name: `Different Topic ${Math.random()}`,
      slug: `rss-only-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    await insertTestRssFeed({
      topicId: topicWithRssOnly,
      title: 'Test RSS Feed 2',
    })

    // Create a topic with matching name but no RSS feed
    const topicWithNameOnly = await insertTestTopic({
      name: `${uniqueText} NoRSS`,
      slug: `name-only-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    // Filter for topics with RSS feed and matching text
    const results = await getTopicIds({
      rss_feed: true,
      text_search_query: uniqueText,
    })
    expect(results.results.some(r => r.id === topicWithRssAndName)).toBe(true)
    expect(results.results.some(r => r.id === topicWithRssOnly)).toBe(false)
    expect(results.results.some(r => r.id === topicWithNameOnly)).toBe(false)
  })

  it('rss_feed filter does not duplicate topics with multiple feeds', async () => {
    const marker = `RssFeedDedup${Date.now()}${Math.random().toString(36).slice(2)}`
    const topicWithMultipleFeeds = await insertTestTopic({
      name: `${marker} Topic`,
      slug: `topic-multi-feeds-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    await insertTestRssFeed({
      topicId: topicWithMultipleFeeds,
      title: 'RSS Feed 1',
      rssFeedUrl: `https://example.com/${marker}-feed-1.xml`,
    })

    // Use text_search_query to scope to the test topic so a dirty DB with many
    // rss-feed topics doesn't push ours beyond the page limit
    const results = await getTopicIds({ rss_feed: true, text_search_query: marker, limit: 100 })

    // Count how many times this topic appears in results
    const occurrences = results.results.filter(r => r.id === topicWithMultipleFeeds).length

    // Topic should still appear exactly once when joined through the rss_feed filter.
    expect(occurrences).toBe(1)
  })

  it('filters by fediverse_instance', async () => {
    const marker = `FediverseFilter${Date.now()}${Math.random().toString(36).slice(2)}`

    const topicWithInstance = await insertTestTopic({
      name: `${marker} With Instance`,
      slug: `topic-fediverse-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
    })
    await insertTestFediverseInstanceExtension({ topicId: topicWithInstance })

    const topicWithoutInstance = await insertTestTopic({
      name: `${marker} Without Instance`,
      slug: `topic-no-fediverse-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const results = await getTopicIds({ fediverse_instance: true, text_search_query: marker })
    expect(results.results.some(r => r.id === topicWithInstance)).toBe(true)
    expect(results.results.some(r => r.id === topicWithoutInstance)).toBe(false)
  })

  it('filters by fediverse_instance_software case-insensitively', async () => {
    const marker = `FediverseSoftware${Date.now()}${Math.random().toString(36).slice(2)}`

    const mastodonTopic = await insertTestTopic({
      name: `${marker} Mastodon`,
      slug: `topic-mastodon-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
    })
    await insertTestFediverseInstanceExtension({ topicId: mastodonTopic, software: 'Mastodon' })

    const lemmyTopic = await insertTestTopic({
      name: `${marker} Lemmy`,
      slug: `topic-lemmy-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
    })
    await insertTestFediverseInstanceExtension({ topicId: lemmyTopic, software: 'lemmy' })

    const results = await getTopicIds({
      fediverse_instance_software: 'MASTODON',
      text_search_query: marker,
    })
    expect(results.results.some(r => r.id === mastodonTopic)).toBe(true)
    expect(results.results.some(r => r.id === lemmyTopic)).toBe(false)
  })

  it('filters by fediverse_instance_open_registrations', async () => {
    const marker = `FediverseOpenReg${Date.now()}${Math.random().toString(36).slice(2)}`

    const openTopic = await insertTestTopic({
      name: `${marker} Open`,
      slug: `topic-open-reg-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
    })
    await insertTestFediverseInstanceExtension({ topicId: openTopic, openRegistrations: true })

    const closedTopic = await insertTestTopic({
      name: `${marker} Closed`,
      slug: `topic-closed-reg-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
    })
    await insertTestFediverseInstanceExtension({ topicId: closedTopic, openRegistrations: false })

    const results = await getTopicIds({
      fediverse_instance_open_registrations: false,
      text_search_query: marker,
    })
    expect(results.results.some(r => r.id === closedTopic)).toBe(true)
    expect(results.results.some(r => r.id === openTopic)).toBe(false)
  })

  it('filters by fediverse_instance_integration_status', async () => {
    const marker = `FediverseStatus${Date.now()}${Math.random().toString(36).slice(2)}`

    const approvedTopic = await insertTestTopic({
      name: `${marker} Approved`,
      slug: `topic-approved-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
    })
    await insertTestFediverseInstanceExtension({ topicId: approvedTopic })
    await insertTestFediverseInstanceIntegrationChange({
      topicId: approvedTopic,
      integrationStatus: 'approved',
    })

    const pendingTopic = await insertTestTopic({
      name: `${marker} Pending`,
      slug: `topic-pending-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'fediverse_instance',
    })
    await insertTestFediverseInstanceExtension({ topicId: pendingTopic })

    const results = await getTopicIds({
      fediverse_instance_integration_status: 'approved',
      text_search_query: marker,
    })
    expect(results.results.some(r => r.id === approvedTopic)).toBe(true)
    expect(results.results.some(r => r.id === pendingTopic)).toBe(false)
  })

  it('returns HTTP 400 for malformed similar_rss_feed_item_id', async () => {
    await expect(
      getTopicIds({
        similar_rss_feed_item_id: 'not-a-uuid',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'similar_rss_feed_item_id must be a valid UUID',
    })
  })
})
