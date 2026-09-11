import { it, expect, describe } from 'vitest'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from './enqueues.mts'

describe('enqueues.topic-ratings.generated', () => {
  it('enqueueBulkUpdateTopicRatingStatsForTopicId returns undefined for empty array', async () => {
    const result = await enqueueBulkUpdateTopicRatingStatsForTopicId([])
    expect(result).toBeUndefined()
  })
})
