import { describe, expect, it } from 'vitest'
import {
  addRssFeedItemSource,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  setRssFeedOwningTopicVoteScore,
} from '@voucha/test-helpers'
import { getRssFeedItemById } from '../get.mts'

describe('RSS item source ranking', () => {
  it('chooses and orders source feeds by Wilson score rather than net votes', async () => {
    const [wilsonTopic, netTopic] = await Promise.all([createTestTopic(), createTestTopic()])
    const [wilsonFeed, netFeed] = await Promise.all([
      createTestRssFeedWithTiming(wilsonTopic.id),
      createTestRssFeedWithTiming(netTopic.id),
    ])
    const item = await createTestRssFeedItemWithUrl(netFeed)
    await Promise.all([
      setRssFeedOwningTopicVoteScore(wilsonFeed, 5, 0),
      setRssFeedOwningTopicVoteScore(netFeed, 100, 90),
      addRssFeedItemSource(wilsonFeed, item.id),
    ])
    const result = await getRssFeedItemById(item.id)
    expect(result?.rss_feed.id).toBe(wilsonFeed)
    expect(result?.rss_feed_sources?.map(feed => feed.id)).toEqual([wilsonFeed, netFeed])
  })
})
