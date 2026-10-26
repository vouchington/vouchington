import { it, expect, describe, vi } from 'vitest'
import { voteAggregation } from '../queues.mts'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from './topic-ratings.mts'

describe('enqueues.topic-ratings.generated', () => {
  it('does not admit a job for empty input', async () => {
    const singleAdmission = vi.spyOn(voteAggregation, 'add')
    const bulkAdmission = vi.spyOn(voteAggregation, 'addBulk')
    try {
      await enqueueBulkUpdateTopicRatingStatsForTopicId([])
      expect(singleAdmission).not.toHaveBeenCalled()
      expect(bulkAdmission).not.toHaveBeenCalled()
    } finally {
      singleAdmission.mockRestore()
      bulkAdmission.mockRestore()
    }
  })
})
