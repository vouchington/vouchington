import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '../queues.mts'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from './topic-ratings.mts'

describe('topic rating stats enqueues', () => {
  it('updates topic rating stats at the requested priority', async () => {
    const addBulk = vi.spyOn(voteAggregation, 'addBulk').mockResolvedValueOnce([])
    const topicId = randomUUID()

    try {
      await enqueueBulkUpdateTopicRatingStatsForTopicId([topicId], 41)

      expect(addBulk).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({
          name: VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB.name,
          data: { topicId },
          opts: expect.objectContaining({ priority: 41 }),
        }),
      ])
    } finally {
      addBulk.mockRestore()
    }
  })
})
