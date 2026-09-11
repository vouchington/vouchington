import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  linkPostToTopic,
  markPostsAsViewed,
  addSpendingCategoryToTopic,
  insertTestRssFeed,
} from '@voucha/test-helpers'
import { getRecommendedTopics } from '@services/recommended-topics'
import type { PrivateUser } from '@services/users/types'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getTopicByAny } from '@services/topics/get'

describe('get-recommendations.filtering', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  it('filters by topic_types', async () => {
    // Create topics with different types
    const topicTopic = await insertTestTopic({
      name: `Topic Type ${Math.random()}`,
      slug: `topic-type-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'topic',
    })

    const cardTopic = await insertTestTopic({
      name: `Card Type ${Math.random()}`,
      slug: `card-type-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'card',
    })

    const rewardsProgramTopic = await insertTestTopic({
      name: `Rewards Program Type ${Math.random()}`,
      slug: `rewards-program-type-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'rewards_program',
    })

    // Create posts and link them
    const posts = []
    for (const topicId of [topicTopic, cardTopic, rewardsProgramTopic]) {
      const postId = await insertTestPost({
        title: `Post ${Math.random()}`,
        slug: `post-${Date.now()}-${Math.random()}`,
        markdown: 'Content',
        createdById: user.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, posts)

    // Filter by card type only
    const cardResults = await getRecommendedTopics(user, { topic_types: ['card'] })
    expect(cardResults.results.some(r => r.id === cardTopic)).toBe(true)
    expect(cardResults.results.some(r => r.id === topicTopic)).toBe(false)
    expect(cardResults.results.some(r => r.id === rewardsProgramTopic)).toBe(false)

    // Filter by multiple types
    const multiResults = await getRecommendedTopics(user, {
      topic_types: ['card', 'rewards_program'],
    })
    expect(multiResults.results.some(r => r.id === cardTopic)).toBe(true)
    expect(multiResults.results.some(r => r.id === rewardsProgramTopic)).toBe(true)
    expect(multiResults.results.some(r => r.id === topicTopic)).toBe(false)
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

    // Create posts and link them
    const posts = []
    for (const topicId of [topicWithSpending, topicWithoutSpending]) {
      const postId = await insertTestPost({
        title: `Post ${Math.random()}`,
        slug: `post-${Date.now()}-${Math.random()}`,
        markdown: 'Content',
        createdById: user.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, posts)

    // Filter for topics with spending category
    const results = await getRecommendedTopics(user, { spending_category: true })
    expect(results.results.some(r => r.id === topicWithSpending)).toBe(true)
    expect(results.results.some(r => r.id === topicWithoutSpending)).toBe(false)
  })

  it('filters by rss_feed', async () => {
    // Create topics - one with RSS feed, one without
    const topicWithRss = await insertTestTopic({
      name: `Topic with RSS ${Math.random()}`,
      slug: `topic-rss-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    await insertTestRssFeed({
      topicId: topicWithRss,
      title: 'Test RSS Feed',
    })

    const topicWithoutRss = await insertTestTopic({
      name: `Topic without RSS ${Math.random()}`,
      slug: `topic-no-rss-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    // Create posts and link them
    const posts = []
    for (const topicId of [topicWithRss, topicWithoutRss]) {
      const postId = await insertTestPost({
        title: `Post ${Math.random()}`,
        slug: `post-${Date.now()}-${Math.random()}`,
        markdown: 'Content',
        createdById: user.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, posts)

    // Filter for topics with RSS feed
    const results = await getRecommendedTopics(user, { rss_feed: true })
    expect(results.results.some(r => r.id === topicWithRss)).toBe(true)
    expect(results.results.some(r => r.id === topicWithoutRss)).toBe(false)
  })

  it('excludes merged topics from recommendations', async () => {
    const source = await insertTestTopic({
      name: `Merged Source Rec ${Math.random()}`,
      slug: `merged-source-rec-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    const destination = await insertTestTopic({
      name: `Merged Dest Rec ${Math.random()}`,
      slug: `merged-dest-rec-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const postId = await insertTestPost({
      title: `Post for merged source ${Math.random()}`,
      slug: `post-merged-source-${Date.now()}-${Math.random()}`,
      markdown: 'Content',
      createdById: user.id,
    })
    await linkPostToTopic(postId, source, user.id)
    await markPostsAsViewed(user.id, [postId])

    const fullSource = await getTopicByAny(source)
    const fullDestination = await getTopicByAny(destination)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')

    await mergeTopicAliases(user, fullSource, fullDestination)

    const results = await getRecommendedTopics(user, {})
    expect(results.results.some(r => r.id === source)).toBe(false)
  })

  it('combines multiple filters', async () => {
    // Create a card topic with RSS feed
    const cardWithRss = await insertTestTopic({
      name: `Card with RSS ${Math.random()}`,
      slug: `card-rss-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'card',
    })
    await insertTestRssFeed({
      topicId: cardWithRss,
      title: 'Card RSS Feed',
    })

    // Create a card topic without RSS feed
    const cardWithoutRss = await insertTestTopic({
      name: `Card without RSS ${Math.random()}`,
      slug: `card-no-rss-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'card',
    })

    // Create a regular topic with RSS feed
    const topicWithRss = await insertTestTopic({
      name: `Topic with RSS ${Math.random()}`,
      slug: `topic-rss2-${Date.now()}-${Math.random()}`,
      createdById: user.id,
      topicType: 'topic',
    })
    await insertTestRssFeed({
      topicId: topicWithRss,
      title: 'Topic RSS Feed',
    })

    // Create posts and link them
    const posts = []
    for (const topicId of [cardWithRss, cardWithoutRss, topicWithRss]) {
      const postId = await insertTestPost({
        title: `Post ${Math.random()}`,
        slug: `post-${Date.now()}-${Math.random()}`,
        markdown: 'Content',
        createdById: user.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, posts)

    // Filter for card topics with RSS feed
    const results = await getRecommendedTopics(user, {
      topic_types: ['card'],
      rss_feed: true,
    })
    expect(results.results.some(r => r.id === cardWithRss)).toBe(true)
    expect(results.results.some(r => r.id === cardWithoutRss)).toBe(false)
    expect(results.results.some(r => r.id === topicWithRss)).toBe(false)
  })
})
