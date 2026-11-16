import { describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  createTestTopicRecommendation,
  getTestTopicRecommendationRejectionReason,
} from '@voucha/test-helpers/topic-recommendation-fixtures'
import { prepareTopicRecommendation } from './create-topic-recommendation.mts'
import { rejectTopicRecommendation } from './reject-topic-recommendation.mts'

describe('topic recommendation rejection', () => {
  it('accepts only one concurrent rejection of an owned pending recommendation', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      admin,
      WEB_PROVENANCE,
      {
        markdown: 'Concurrent rejection',
        topic_title: `Reject ${suffix}`,
        topic_slug: `reject-${suffix}`,
      },
    )
    const outcomes = await Promise.allSettled([
      rejectTopicRecommendation(admin, recommendation, 'first'),
      rejectTopicRecommendation(admin, recommendation, 'second'),
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(outcome => outcome.status === 'rejected')
    expect(rejected?.reason).toMatchObject({ status: 422 })
    const winner = outcomes[0]!.status === 'fulfilled' ? 'first' : 'second'
    await expect(getTestTopicRecommendationRejectionReason(recommendation.id)).resolves.toBe(winner)
  })
})
