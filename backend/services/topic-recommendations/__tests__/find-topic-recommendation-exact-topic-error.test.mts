import { describe, expect, it } from 'vitest'
import { rejectPostgresReadForTest } from '@voucha/test-helpers/injected-failures'
import { findTopicRecommendationDuplicates } from '../find-topic-recommendation-duplicates.mts'

describe('findTopicRecommendationDuplicates (getTopicsByAnyBatch error propagation)', () => {
  it('propagates non-422 errors thrown by getTopicsByAnyBatch', async () => {
    const dbError = Object.assign(new Error('connection refused'), { status: 500 })
    const restoreRead = rejectPostgresReadForTest('/* getTopicsByAnyBatch */', dbError)
    const random = `non-422-error-${crypto.randomUUID()}`

    try {
      await expect(
        findTopicRecommendationDuplicates({
          topic_title: `Non 422 Error Topic ${random}`,
          topic_slug: `non-422-error-topic-${random}`,
        }),
      ).rejects.toBe(dbError)
    } finally {
      restoreRead()
    }
  })
})
