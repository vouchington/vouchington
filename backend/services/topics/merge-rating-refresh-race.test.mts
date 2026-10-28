import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, insertTestTopicMetricsBatch } from '@voucha/test-helpers'
import {
  hasTopicMergeRatingMetricRow,
  runTopicMergeRatingRefreshRace,
} from '@voucha/test-helpers/topic-merge-rating-refresh-race'
import { updateTopicRatingStats } from './ratings.mts'

describe('topic merge and source rating refresh', () => {
  it('rechecks the source after its rating lock wait and leaves cleared metrics absent', async () => {
    const administrator = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: administrator })
    const destination = await createTestTopic({ user: administrator })
    await insertTestTopicMetricsBatch([source.id])
    expect(await hasTopicMergeRatingMetricRow(source.id)).toBe(true)

    const race = await runTopicMergeRatingRefreshRace(source.id, destination.id, administrator.id)
    expect(race).toEqual({ passedPrecheck: true, stayedActive: false })
    expect(await hasTopicMergeRatingMetricRow(source.id)).toBe(false)

    // The public refresher uses this same lock helper and cannot recreate a merged source row.
    await updateTopicRatingStats(source.id)
    expect(await hasTopicMergeRatingMetricRow(source.id)).toBe(false)
  })
})
