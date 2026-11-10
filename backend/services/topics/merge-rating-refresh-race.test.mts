import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, insertTestTopicMetricsBatch } from '@voucha/test-helpers'
import {
  commitTopicMergeClearingRatingMetrics,
  hasTopicMergeRatingMetricRow,
} from '@voucha/test-helpers/topic-merge-rating-refresh-race'
import { updateTopicRatingStats } from './ratings.mts'

describe('topic merge and source rating refresh', () => {
  it('leaves cleared source metrics absent after the source is merged', async () => {
    const administrator = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: administrator })
    const destination = await createTestTopic({ user: administrator })
    await insertTestTopicMetricsBatch([source.id])
    expect(await hasTopicMergeRatingMetricRow(source.id)).toBe(true)

    await commitTopicMergeClearingRatingMetrics(source.id, destination.id, administrator.id)
    expect(await hasTopicMergeRatingMetricRow(source.id)).toBe(false)

    await updateTopicRatingStats(source.id)
    expect(await hasTopicMergeRatingMetricRow(source.id)).toBe(false)
  })
})
