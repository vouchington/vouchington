import { describe, expect, it } from 'vitest'

import {
  createTestUser,
  getTopicRatingStats,
  insertTestReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { TOPIC_ELECTION_CONFIG } from '@services/elections-votes/topic'
import { upsertElectionVotesShared } from '@services/elections-votes/shared'
import { randomUUID } from 'node:crypto'
import { getTopicByAny } from './get.mts'
import { updateTopicRatingStats } from './ratings.mts'

describe('updateTopicRatingStats — election votes', () => {
  it('topic votes override neutral three-star reviews in score buckets only', async () => {
    const random = randomUUID()
    const user = await createTestUser({ username: `neutral-user-${random}` })
    if (!user) throw new Error('Failed to create test user')
    const topicId = await insertTestTopic({
      name: `Neutral Topic ${random}`,
      slug: `neutral-topic-${random}`,
      createdById: user.id,
    })
    await insertTestReview({ userId: user.id, topicRatings: [{ topicId, rating: 3 }] })
    const topic = await getTopicByAny(topicId)
    if (!topic) throw new Error('Failed to load test topic')
    await upsertElectionVotesShared(TOPIC_ELECTION_CONFIG, user.id, [
      { entityId: topic.id, score: 1 },
    ])

    await updateTopicRatingStats(topicId)

    await expect(getTopicRatingStats(topicId)).resolves.toMatchObject({
      ratings__count__3: 1,
      ratings__score__3: 0,
      ratings__score__4: 1,
    })
  })
})
