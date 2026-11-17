import { it, expect, describe, vi } from 'vitest'
import { background } from '@queues/background/queues'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from './topic-ratings.mts'

describe('enqueues.topic-ratings.generated', () => {
  it('does not admit a job for empty input', async () => {
    const singleAdmission = vi.spyOn(background, 'add')
    const bulkAdmission = vi.spyOn(background, 'addBulk')
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
