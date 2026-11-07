import { describe, expect, it } from 'vitest'
import {
  addRssFeedTopicPublisherTypeWithScore,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  insertEntityRelation,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { getDominantPublisherTypeSlug } from '@services/topics/get-dominant-publisher-type'
import { getPublisherTypeTopics } from '@services/topics/publisher-type-topics'
import { getRssFeedsByIdBatch } from '../get-batch.mts'
import { searchRssFeeds } from '../search.mts'

const table = 'relation__topic__publisher_type__topic'

describe('publisher type score ties', () => {
  it('uses the newest relation, then highest topic id, across display and search', async () => {
    const publisherTypes = (await getPublisherTypeTopics()).toSorted((a, b) =>
      a.id.localeCompare(b.id),
    )
    expect(publisherTypes.length).toBeGreaterThanOrEqual(2)
    const older = publisherTypes.at(-1)!
    const newer = publisherTypes[0]!
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const feedId = await createTestRssFeedWithTiming(topic.id)

    // Equal Wilson scores. The older relation has the greater object id, so each
    // tie-breaker can be exercised independently.
    await addRssFeedTopicPublisherTypeWithScore(topic.id, older.id, 1)
    await addRssFeedTopicPublisherTypeWithScore(topic.id, newer.id, 1)
    const earlier = new Date('2025-01-01T00:00:00Z')
    const later = new Date('2025-01-02T00:00:00Z')
    await Promise.all([
      updateTestEntityRelationCreatedAt(table, topic.id, older.id, earlier),
      updateTestEntityRelationCreatedAt(table, topic.id, newer.id, later),
    ])

    expect(await getDominantPublisherTypeSlug(topic.id)).toBe(newer.slug)
    expect((await getRssFeedsByIdBatch([feedId]))[0]?.publisher_type?.id).toBe(newer.id)
    expect(
      (await searchRssFeeds({ topic_id: topic.id, publisher_type_id: newer.id })).map(
        feed => feed.id,
      ),
    ).toContain(feedId)
    expect(
      (await searchRssFeeds({ topic_id: topic.id, publisher_type_id: older.id })).map(
        feed => feed.id,
      ),
    ).not.toContain(feedId)

    await insertEntityRelation('relation__user__mute__topic', user.id, older.id)
    expect(
      (await searchRssFeeds({ topic_id: topic.id, current_user_id: user.id })).map(feed => feed.id),
    ).toContain(feedId)
    await insertEntityRelation('relation__user__mute__topic', user.id, newer.id)
    expect(
      (await searchRssFeeds({ topic_id: topic.id, current_user_id: user.id })).map(feed => feed.id),
    ).not.toContain(feedId)
    await updateTestEntityRelationCreatedAt(table, topic.id, older.id, later)
    expect(await getDominantPublisherTypeSlug(topic.id)).toBe(older.slug)
    expect((await getRssFeedsByIdBatch([feedId]))[0]?.publisher_type?.id).toBe(older.id)
    expect(
      (await searchRssFeeds({ topic_id: topic.id, publisher_type_id: older.id })).map(
        feed => feed.id,
      ),
    ).toContain(feedId)
  })
})
