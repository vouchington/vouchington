import '@services/bookmarks'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  getTopicFollowExistsForTest,
  getTopicImportRequestByRecommendationForTest,
  insertPendingTopicImportRequestForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { prepareTopicRecommendation } from '@services/topic-recommendations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { autoFollowOnRecommendationApproval } from './auto-follow-on-approval.mts'

describe('approval follow limit', () => {
  it('leaves the request pending and approval succeeds when capacity is exhausted', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const user = await createTestUser()
    const [followed, target] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'topic',
    })
    await upsertEntityRelation(user, relation, user, [followed])
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      user,
      WEB_PROVENANCE,
      {
        topic_title: 'Pending import recommendation',
        topic_slug: `limit-${randomUUID()}`,
        markdown: 'Owned import recommendation',
      },
      { skipCreatedEvents: true },
    )
    await insertPendingTopicImportRequestForTest(user.id, recommendation.id, target.name)
    await expect(
      autoFollowOnRecommendationApproval(recommendation.id, target.id),
    ).resolves.toBeUndefined()
    expect(
      await getTopicImportRequestByRecommendationForTest(user.id, recommendation.id),
    ).toMatchObject({ followed_at: null, topic_id: null })
    expect(await getTopicFollowExistsForTest(user.id, target.id)).toBe(false)
  })
})
