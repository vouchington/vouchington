import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  getTopicRatingStats,
  insertTestTopic,
  insertTopicElectionVote,
} from '@voucha/test-helpers'
import { updateTopicRatingStats } from './ratings.mts'

describe('topic rating vote provenance', () => {
  it('uses historic Vouch strength for legacy positive topic votes', async () => {
    const random = randomUUID()
    const creator = await createTestUser({ username: `rating-vouch-creator-${random}` })
    const voter = await createTestUser({ username: `rating-vouch-voter-${random}` })
    const topicId = await insertTestTopic({
      name: `Rating Vouch provenance ${random}`,
      slug: `rating-vouch-provenance-${random}`,
      createdById: creator!.id,
    })

    await insertTopicElectionVote(voter!.id, topicId, 1)
    await updateTopicRatingStats(topicId)

    await expect(getTopicRatingStats(topicId)).resolves.toMatchObject({
      ratings__score__5: 1,
      ratings__score__4: 0,
    })
  })
})
