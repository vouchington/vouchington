import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { userImportExportConfig } from './config.mts'
import {
  createTestTopic,
  createTestUser,
  getTopicFollowExistsForTest,
  getTopicImportRequestByRecommendationForTest,
  insertPendingTopicImportRequestForTest,
  WEB_PROVENANCE,
  softDeleteUser,
} from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { autoFollowOnRecommendationApproval } from './auto-follow-on-approval.mts'
import { prepareTopicRecommendation } from '@services/topic-recommendations'

describe('recommendation approval auto-follow database failure', () => {
  it('continues past a deleted user to later pages', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_status_page_size: 1 }),
    )
    const first = await createTestUser()
    const second = await createTestUser()
    const topic = await createTestTopic({ user: second })
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      second,
      WEB_PROVENANCE,
      {
        topic_title: 'Paged import',
        topic_slug: `paged-import-${randomUUID()}`,
        markdown: 'Paged import',
      },
      { skipCreatedEvents: true },
    )
    await insertPendingTopicImportRequestForTest(first.id, recommendation.id, topic.name)
    await insertPendingTopicImportRequestForTest(second.id, recommendation.id, topic.name)
    await softDeleteUser(first.id)

    await autoFollowOnRecommendationApproval(recommendation.id, topic.id)

    expect(
      await getTopicImportRequestByRecommendationForTest(first.id, recommendation.id),
    ).toMatchObject({ followed_at: null })
    expect(
      await getTopicImportRequestByRecommendationForTest(second.id, recommendation.id),
    ).toMatchObject({ followed_at: expect.any(Date) })
    expect(await getTopicFollowExistsForTest(second.id, topic.id)).toBe(true)
  })

  it('reports a user lookup failure and leaves the request pending for a healthy retry', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      user,
      WEB_PROVENANCE,
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
