import { describe, expect, it } from 'vitest'

import { bookmarkEntity } from '@services/bookmarks/upsert'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic/votes-upsert'
import { createTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'

import { getRssFeedsByIdBatch } from './get-batch.mts'
import { buildRssFeedSidecars } from './list-sidecars.mts'

describe('buildRssFeedSidecars', () => {
  it('returns the viewer vote and bookmarks with election maps and omits them for anonymous viewers', async () => {
    const currentUser = await createTestUser()
    const created = await createTestRssFeed({})
    const feed = (await getRssFeedsByIdBatch([created.id]))[0]
    expect(feed?.topic.id).toEqual(expect.any(String))
    const topicId = feed!.topic.id

    await upsertTopicElectionVotes(currentUser.id, [{ entityId: topicId, score: 1 }])
    await bookmarkEntity(currentUser, 'rss_feed', { id: feed!.id }, 'follow')
    await bookmarkEntity(currentUser, 'topic', { id: topicId }, 'follow')

    const sidecars = await buildRssFeedSidecars([feed!], currentUser)

    expect(sidecars.topic_elections[topicId]).toBeDefined()
    expect(sidecars.election_votes?.[topicId]).toMatchObject({
      entity_id: topicId,
      choice: 'like',
    })
    expect(sidecars.bookmarks?.[feed!.id]?.follow).toBe(true)
    expect(sidecars.bookmarks?.[topicId]?.follow).toBe(true)

    const anonymous = await buildRssFeedSidecars([feed!], null)
    expect(anonymous.topic_elections[topicId]).toBeDefined()
    expect(anonymous.election_votes).toBeUndefined()
    expect(anonymous.bookmarks).toBeUndefined()
  })
})
