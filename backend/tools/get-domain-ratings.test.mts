import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import getDomainRatingsTool from './get-domain-ratings.mts'
import {
  createTestTopic,
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestRssFeedItem,
  insertTestUrl,
  insertTestUrlHostname,
  setUrlHostnameVotes,
} from '@voucha/test-helpers'
import { getRssFeedById } from '@services/rss-feeds/get'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import type { PrivateUser } from '@services/users/types'

describe('get_domain_ratings tool — real DB', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('uses a non-strict tool schema', () => {
    expect(getDomainRatingsTool.schema.strict).toBeNull()
  })

  it('returns hostname trust for a hostname lookup', async () => {
    const suffix = randomUUID().slice(0, 8)
    const hostname = `trust-${suffix}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    await setUrlHostnameVotes(hostnameId, 7, 2)

    const execute = getDomainRatingsTool.function(user)
    const result = await execute({ hostname })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.hostname).toBe(hostname)
    expect(result.hostname_id).toBe(hostnameId)
    expect(result.domain_trust).toEqual({
      votes_score_net: 5,
      votes_count_up: 7,
      votes_count_down: 2,
    })
    expect(result).not.toHaveProperty('source_topic')
  })

  it('returns domain trust plus source topic metrics for an article URL', async () => {
    const suffix = randomUUID().slice(0, 8)
    const topic = await createTestTopic({
      user,
      name: `Politics Source ${suffix}`,
      slug: `politics-source-${suffix}`,
      topic_type: 'rss_feed',
      hostname: `source-${suffix}.example.com`,
    })
    const feed = await createTestRssFeed({
      topicId: topic.id,
      rssFeedUrl: `https://source-${suffix}.example.com/feed.xml`,
      title: `Source Feed ${suffix}`,
    })
    const rssFeed = await getRssFeedById(feed.id)
    expect(rssFeed).not.toBeNull()
    if (!rssFeed) return

    const hostnameId = rssFeed.rss_feed_url.hostname.id
    await setUrlHostnameVotes(hostnameId, 9, 1)

    const articleUrl = `https://source-${suffix}.example.com/articles/${suffix}`
    const articleUrlId = await insertTestUrl({ url: articleUrl, hostnameId })
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: articleUrlId,
      guid: `article-${suffix}`,
      itemData: { title: `Article ${suffix}` },
      contentSha256: createHash('sha256').update(articleUrl).digest(),
    })

    const reviewPostId = await insertTestPost({
      title: `Source review ${suffix}`,
      slug: `source-review-${suffix}`,
      createdById: user.id,
      markdown: 'Helpful source review',
      postType: 'review',
    })
    await insertTestPostReview(reviewPostId, topic.id, 4)

    const execute = getDomainRatingsTool.function(user)
    const result = await execute({ url: articleUrl })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.domain_trust).toEqual({
      votes_score_net: 8,
      votes_count_up: 9,
      votes_count_down: 1,
    })
    expect(result.rss_feed).toMatchObject({
      rss_feed_id: feed.id,
      title: `Source Feed ${suffix}`,
    })
    expect(result.source_topic).toMatchObject({
      topic_id: topic.id,
      topic_slug: topic.slug,
      topic_title: topic.name,
      ratings: {
        count_1: expect.any(Number),
        count_2: expect.any(Number),
        count_3: expect.any(Number),
        count_4: expect.any(Number),
        count_5: expect.any(Number),
      },
      content_counts: {
        discussions: expect.any(Number),
        reviews: expect.any(Number),
        data_points: expect.any(Number),
        news: expect.any(Number),
      },
      followers: expect.any(Number),
    })
  })

  it('returns domain trust plus source topic metrics for a feed homepage URL', async () => {
    const suffix = randomUUID().slice(0, 8)
    const topic = await createTestTopic({
      user,
      name: `Feed Home Source ${suffix}`,
      slug: `feed-home-source-${suffix}`,
      topic_type: 'rss_feed',
      hostname: `feed-home-${suffix}.example.com`,
    })
    const feed = await createTestRssFeed({
      topicId: topic.id,
      rssFeedUrl: `https://feed-home-${suffix}.example.com/feed.xml`,
      title: `Feed Home ${suffix}`,
    })
    const rssFeed = await getRssFeedById(feed.id)
    expect(rssFeed).not.toBeNull()
    if (!rssFeed) return
    await setUrlHostnameVotes(rssFeed.rss_feed_url.hostname.id, 6, 1)

    const execute = getDomainRatingsTool.function(user)
    const result = await execute({ url: rssFeed.rss_feed_url.url })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rss_feed?.rss_feed_id).toBe(feed.id)
    expect(result.source_topic?.topic_id).toBe(topic.id)
  })

  it('falls back to hostname trust when a URL has no RSS source mapping', async () => {
    const suffix = randomUUID().slice(0, 8)
    const hostname = `unmapped-${suffix}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    await setUrlHostnameVotes(hostnameId, 3, 1)

    const url = `https://${hostname}/article`
    await insertTestUrl({ url, hostnameId })

    const execute = getDomainRatingsTool.function(user)
    const result = await execute({ url })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.domain_trust.votes_score_net).toBe(2)
    expect(result).not.toHaveProperty('source_topic')
    expect(result).not.toHaveProperty('rss_feed')
  })

  it('returns success false when the caller provides invalid arguments', async () => {
    const execute = getDomainRatingsTool.function(user)
    const [missingArgsResult, bothArgsResult] = await Promise.all([
      execute({}),
      execute({ url: 'https://example.com', hostname: 'example.com' }),
    ])

    expect(missingArgsResult).toEqual({
      success: false,
      error: 'Provide exactly one of url or hostname.',
    })
    expect(bothArgsResult).toEqual({
      success: false,
      error: 'Provide exactly one of url or hostname.',
    })
  })
})
