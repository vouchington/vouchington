import { describe, expect, it } from 'vitest'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  addCategoryToRssFeedItem,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  followTopic,
  insertTestStory,
  setTestItemStoryId,
  setTestRssFeedItemVotes,
} from '@voucha/test-helpers'

const meetingScore = 5

describe('getRssFeedItemFeedIds eligibility regressions', () => {
  it('keeps any and all eligibility when source and topic score thresholds differ', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const otherTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const otherFeedId = await createTestRssFeedWithTiming(otherTopic.id)
    await Promise.all([followRssFeed(user, feedId), followTopic(user, topic)])

    const sourceLow = await createTestRssFeedItemWithUrl(feedId)
    const sourceHigh = await createTestRssFeedItemWithUrl(feedId)
    const topicLow = await createTestRssFeedItemWithUrl(otherFeedId)
    const topicHigh = await createTestRssFeedItemWithUrl(otherFeedId)
    const bothLow = await createTestRssFeedItemWithUrl(feedId)
    const bothHigh = await createTestRssFeedItemWithUrl(feedId)
    await Promise.all([
      setTestRssFeedItemVotes(sourceHigh.id, meetingScore),
      setTestRssFeedItemVotes(topicHigh.id, meetingScore),
      setTestRssFeedItemVotes(bothHigh.id, meetingScore),
      addCategoryToRssFeedItem(topicLow.id, topic.id),
      addCategoryToRssFeedItem(topicHigh.id, topic.id),
      addCategoryToRssFeedItem(bothLow.id, topic.id),
      addCategoryToRssFeedItem(bothHigh.id, topic.id),
    ])
    const ids = {
      sourceLow: sourceLow.id,
      sourceHigh: sourceHigh.id,
      topicLow: topicLow.id,
      topicHigh: topicHigh.id,
      bothLow: bothLow.id,
      bothHigh: bothHigh.id,
    }
    const cases = [
      {
        feed_type: 'any' as const,
        min_score_follow_rss_feeds: meetingScore,
        min_score_follow_topics: 0,
        included: [ids.sourceHigh, ids.topicLow, ids.topicHigh, ids.bothLow, ids.bothHigh],
      },
      {
        feed_type: 'all' as const,
        min_score_follow_rss_feeds: meetingScore,
        min_score_follow_topics: 0,
        included: [ids.bothHigh],
      },
      {
        feed_type: 'any' as const,
        min_score_follow_rss_feeds: 0,
        min_score_follow_topics: meetingScore,
        included: [ids.sourceLow, ids.sourceHigh, ids.topicHigh, ids.bothLow, ids.bothHigh],
      },
      {
        feed_type: 'all' as const,
        min_score_follow_rss_feeds: 0,
        min_score_follow_topics: meetingScore,
        included: [ids.bothHigh],
      },
    ]

    for (const entry of cases) {
      const page = await getRssFeedItemFeedIds(user, {
        feed_type: entry.feed_type,
        limit: 10,
        min_score_follow_rss_feeds: entry.min_score_follow_rss_feeds,
        min_score_follow_topics: entry.min_score_follow_topics,
      })
      expect({
        feed_type: entry.feed_type,
        min_score_follow_rss_feeds: entry.min_score_follow_rss_feeds,
        min_score_follow_topics: entry.min_score_follow_topics,
        ids: page.results.map(row => row.entity_id).toSorted(),
        has_next_page: page.page_info.has_next_page,
      }).toEqual({
        feed_type: entry.feed_type,
        min_score_follow_rss_feeds: entry.min_score_follow_rss_feeds,
        min_score_follow_topics: entry.min_score_follow_topics,
        ids: [...entry.included].toSorted(),
        has_next_page: false,
      })
    }
  })

  it('keeps official priority only when that item still clears an applicable threshold', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await Promise.all([followRssFeed(user, feedId), followTopic(user, topic)])
    const official = await createTestRssFeedItemWithUrl(feedId)
    const sibling = await createTestRssFeedItemWithUrl(feedId)
    const story = await insertTestStory({ officialRssFeedItemId: official.id })
    await Promise.all([
      setTestItemStoryId(official.id, story.id),
      setTestItemStoryId(sibling.id, story.id),
      setTestRssFeedItemVotes(sibling.id, meetingScore),
      addCategoryToRssFeedItem(official.id, topic.id),
      addCategoryToRssFeedItem(sibling.id, topic.id),
    ])
    const cases = [
      {
        feed_type: 'any' as const,
        min_score_follow_rss_feeds: meetingScore,
        min_score_follow_topics: 0,
        winner: official.id,
      },
      {
        feed_type: 'all' as const,
        min_score_follow_rss_feeds: meetingScore,
        min_score_follow_topics: 0,
        winner: sibling.id,
      },
      {
        feed_type: 'any' as const,
        min_score_follow_rss_feeds: 0,
        min_score_follow_topics: meetingScore,
        winner: official.id,
      },
      {
        feed_type: 'all' as const,
        min_score_follow_rss_feeds: 0,
        min_score_follow_topics: meetingScore,
        winner: sibling.id,
      },
    ]

    for (const entry of cases) {
      const page = await getRssFeedItemFeedIds(user, {
        feed_type: entry.feed_type,
        limit: 10,
        min_score_follow_rss_feeds: entry.min_score_follow_rss_feeds,
        min_score_follow_topics: entry.min_score_follow_topics,
      })
      expect({
        feed_type: entry.feed_type,
        min_score_follow_rss_feeds: entry.min_score_follow_rss_feeds,
        min_score_follow_topics: entry.min_score_follow_topics,
        rows: page.results.map(row => [row.entity_id, row.story_id, row.delivery_type]),
        has_next_page: page.page_info.has_next_page,
      }).toEqual({
        feed_type: entry.feed_type,
        min_score_follow_rss_feeds: entry.min_score_follow_rss_feeds,
        min_score_follow_topics: entry.min_score_follow_topics,
        rows: [[entry.winner, story.id, 'direct']],
        has_next_page: false,
      })
    }
  })

  it('selects the in-window sibling when the official item is outside the UUID cutoff', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)
    const official = await createTestRssFeedItemWithUrl(feedId, {
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    })
    const sibling = await createTestRssFeedItemWithUrl(feedId)
    const story = await insertTestStory({ officialRssFeedItemId: official.id })
    await Promise.all([
      setTestItemStoryId(official.id, story.id),
      setTestItemStoryId(sibling.id, story.id),
      setTestRssFeedItemVotes(sibling.id, meetingScore),
    ])

    const windowed = await getRssFeedItemFeedIds(user, {
      feed_type: 'any',
      limit: 10,
      time_range: '1d',
    })
    expect(windowed.results.map(row => [row.entity_id, row.story_id, row.delivery_type])).toEqual([
      [sibling.id, story.id, 'direct'],
    ])
    expect(windowed.page_info.has_next_page).toBe(false)

    const unbounded = await getRssFeedItemFeedIds(user, {
      feed_type: 'any',
      limit: 10,
      time_range: 'all',
    })
    expect(unbounded.results.map(row => [row.entity_id, row.story_id, row.delivery_type])).toEqual([
      [official.id, story.id, 'direct'],
    ])
    expect(unbounded.page_info.has_next_page).toBe(false)
  })
})
