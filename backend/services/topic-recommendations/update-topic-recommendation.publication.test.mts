import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getPostByAny } from '@services/posts'
import { createTopicRecommendation, updateTopicRecommendation } from './index.mts'

describe('updateTopicRecommendation publication capture', () => {
  it('records the edited recommendation for durable post reconciliation', async () => {
    const user = await createTestUser()
    const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
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

  it('rejects another user without changing the recommendation or publication work', async () => {
    const owner = await createTestUser()
    const otherUser = await createTestUser()
    const recommendation = await createTopicRecommendation(owner, WEB_PROVENANCE, {
      markdown: 'Original recommendation rationale',
      topic_title: 'Original recommendation topic',
      topic_slug: `recommendation-unauthorized-${crypto.randomUUID()}`,
    })
    const publicationWorkBefore = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: recommendation.id,
    })

    await expect(
      updateTopicRecommendation(otherUser, recommendation, {
        markdown: 'Unauthorized replacement rationale',
        topic_title: 'Unauthorized replacement topic',
      }),
    ).rejects.toMatchObject({
      status: 403,
      extra: {
        function: 'updateTopicRecommendation',
        recommendationId: recommendation.id,
        currentUserId: otherUser.id,
      },
      tags: { area: 'topic-recommendations' },
    })

    const persistedRecommendation = await getPostByAny(recommendation.id)
    expect(persistedRecommendation).toMatchObject({
      markdown: 'Original recommendation rationale',
      topic_recommendation: {
        topic_title: 'Original recommendation topic',
      },
    })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: recommendation.id }),
    ).resolves.toEqual(publicationWorkBefore)
  })
})
