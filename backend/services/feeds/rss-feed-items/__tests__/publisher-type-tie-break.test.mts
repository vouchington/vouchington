import { describe, expect, it } from 'vitest'
import {
  addRssFeedTopicPublisherTypeWithScore,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  insertEntityRelation,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'

describe('RSS item publisher type mutes', () => {
  it('uses the newest relation when publisher types have equal scores', async () => {
    const user = await createTestUser()
    const [source, older, newer] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const feedId = await createTestRssFeedWithTiming(source.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    await followRssFeed(user, feedId)
    await addRssFeedTopicPublisherTypeWithScore(source.id, older.id, 1)
    await addRssFeedTopicPublisherTypeWithScore(source.id, newer.id, 1)
    const table = 'relation__topic__publisher_type__topic'
    await Promise.all([
      updateTestEntityRelationCreatedAt(
        table,
        source.id,
        older.id,
        new Date('2025-01-01T00:00:00Z'),
      ),
      updateTestEntityRelationCreatedAt(
        table,
        source.id,
        newer.id,
        new Date('2025-01-02T00:00:00Z'),
      ),
    ])
    await insertEntityRelation('relation__user__mute__topic', user.id, older.id)
    expect(
      (await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds' })).results.map(
        row => row.entity_id,
      ),
    ).toContain(item.id)
    await insertEntityRelation('relation__user__mute__topic', user.id, newer.id)
    expect(
      (await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds' })).results.map(
        row => row.entity_id,
      ),
    ).not.toContain(item.id)
  })
})
