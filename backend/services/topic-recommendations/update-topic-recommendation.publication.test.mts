import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createTopicRecommendation, updateTopicRecommendation } from './index.mts'

describe('updateTopicRecommendation publication capture', () => {
  it('records the edited recommendation for durable post reconciliation', async () => {
    const user = await createTestUser()
    const recommendation = await createTopicRecommendation(WEB_PROVENANCE, user, {
      markdown: 'Original recommendation rationale',
      topic_title: 'Original recommendation topic',
      topic_slug: `recommendation-publication-${crypto.randomUUID()}`,
    })

    await updateTopicRecommendation(user, recommendation, {
      markdown: 'Updated recommendation rationale',
    })

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: recommendation.id }),
    ).resolves.toMatchObject({ reasons: expect.arrayContaining(['post_updated']) })
  })
})
