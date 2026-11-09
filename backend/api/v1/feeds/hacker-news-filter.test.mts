import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  followRssFeed,
  followUser,
} from '@voucha/test-helpers'
import { setHackerNewsReferenceFlagsForTest } from '@voucha/test-helpers/hacker-news-references'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

const FILTER_SPELLINGS = [
  ['true', 'seen'],
  ['TRUE', 'seen'],
  ['1', 'seen'],
  ['false', 'plain'],
  ['FALSE', 'plain'],
  ['0', 'plain'],
] as const

type FeedFixture = {
  request: ReturnType<typeof createRequest>
  seenId: string
  plainId: string
}

async function seedPersonalizedHackerNewsFeed(): Promise<FeedFixture> {
  const user = await createTestUser()
  const sharer = await createTestUser()
  const topic = await createTestTopic()
  const feedId = await createTestRssFeedWithTiming(topic.id)
  const seen = await createTestRssFeedItemWithUrl(feedId)
  const plain = await createTestRssFeedItemWithUrl(feedId)
  await setHackerNewsReferenceFlagsForTest([], [seen.id])
  await followRssFeed(user, feedId)
  await followUser(user, sharer)
  for (const item of [seen, plain]) {
    const shared = await shareRssFeedItemWithFollowers(sharer, item.id)
    await processFollowerDistributionChunk(shared.distribution_id)
  }
  const request = createRequest()
  await request.authenticateAs(user)
  return { request, seenId: seen.id, plainId: plain.id }
}

async function filterResultIds(
  request: FeedFixture['request'],
  feedType: 'follow_rss_feeds' | 'follow_users',
): Promise<string[][]> {
  const ids: string[][] = []
  for (const [value] of FILTER_SPELLINGS) {
    const response = await request
      .get(`/api/v1/feeds/rss_feed_items/${feedType}`)
      .query({ has_hacker_news_references: value, time_range: 'all' })
      .expect(200)
    ids.push(response.body.results.map((row: { entity_id: string }) => row.entity_id))
  }
  return ids
}

function expectedSpellingIds(seenId: string, plainId: string): string[][] {
  return FILTER_SPELLINGS.map(([, which]) => [which === 'seen' ? seenId : plainId])
}

describe('personalized RSS Hacker News filter', () => {
  it('filters direct deliveries for every accepted spelling and ignores the filter when visibility is off', async () => {
    const { request, seenId, plainId } = await seedPersonalizedHackerNewsFeed()
    expect(await filterResultIds(request, 'follow_rss_feeds')).toEqual(
      expectedSpellingIds(seenId, plainId),
    )
    const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
    })
    try {
      const response = await request
        .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
        .query({ has_hacker_news_references: 'true', time_range: 'all' })
        .expect(200)
      expect(
        response.body.results.map((row: { entity_id: string }) => row.entity_id).toSorted(),
      ).toEqual([seenId, plainId].toSorted())
    } finally {
      restore()
    }
    await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
      .query({ has_hacker_news_references: 'maybe' })
      .expect(422)
  })

  it('filters shared deliveries for every accepted spelling', async () => {
    const { request, seenId, plainId } = await seedPersonalizedHackerNewsFeed()
    expect(await filterResultIds(request, 'follow_users')).toEqual(
      expectedSpellingIds(seenId, plainId),
    )
  })
})
