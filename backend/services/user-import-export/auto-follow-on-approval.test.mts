import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  getTopicFollowExistsForTest,
  getTopicImportRequestByRecommendationForTest,
  insertPendingTopicImportRequestForTest,
} from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { autoFollowOnRecommendationApproval } from './auto-follow-on-approval.mts'
import { createTopicRecommendation } from '@services/topic-recommendations'

describe('recommendation approval auto-follow database failure', () => {
  it('reports a user lookup failure and leaves the request pending for a healthy retry', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const recommendation = await createTopicRecommendation(
      user,
      {
        topic_title: 'Pending import recommendation',
        topic_slug: `auto-follow-recommendation-${randomUUID()}`,
        markdown: 'Owned import recommendation',
      },
      { skipCreatedEvents: true },
    )
    const recommendationPostId = recommendation.id
    await insertPendingTopicImportRequestForTest(user.id, recommendationPostId, topic.name)

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* getPrivateUsersByAnyBatch */',
      () => autoFollowOnRecommendationApproval(recommendationPostId, topic.id),
    )

    expect(result).toBeUndefined()
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    expect(
      await getTopicImportRequestByRecommendationForTest(user.id, recommendationPostId),
    ).toMatchObject({
      followed_at: null,
      topic_id: null,
    })
    expect(await getTopicFollowExistsForTest(user.id, topic.id)).toBe(false)

    await autoFollowOnRecommendationApproval(recommendationPostId, topic.id)
    expect(
      await getTopicImportRequestByRecommendationForTest(user.id, recommendationPostId),
    ).toMatchObject({
      followed_at: expect.any(Date),
      topic_id: topic.id,
    })
    expect(await getTopicFollowExistsForTest(user.id, topic.id)).toBe(true)
  })
})
