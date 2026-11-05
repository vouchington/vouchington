import { describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { getPostByAny } from '@services/posts'
import { getTopicByAny } from '@services/topics/get'
import { prepareTopicRecommendation } from './create-topic-recommendation.mts'
import { approveTopicRecommendation } from './approve-topic-recommendation.mts'

describe('topic recommendation approval transaction ownership', () => {
  it('commits approval and the created topic through its owned transaction', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const slug = `approval-owned-${suffix}`
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      admin,
      WEB_PROVENANCE,
      { markdown: 'Owned approval', topic_title: `Owned ${suffix}`, topic_slug: slug },
    )

    const approved = await approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation)

    expect(approved.recommendation.topic_recommendation.status).toBe('approved')
    expect(approved.topic_slug).toBe(slug)
    expect(approved.topic_type).toBe('topic')
    await expect(getTopicByAny(approved.topic_id)).resolves.toMatchObject({
      id: approved.topic_id,
      slug,
      name: `Owned ${suffix}`,
    })
  })

  it('rolls the approval and created topic back with the borrowed transaction', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      admin,
      WEB_PROVENANCE,
      {
        markdown: 'Borrowed approval',
        topic_title: `Borrowed ${suffix}`,
        topic_slug: `approval-borrowed-${suffix}`,
      },
    )
    const sibling = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      admin,
      WEB_PROVENANCE,
      {
        markdown: 'Committed sibling approval',
        topic_title: `Sibling ${suffix}`,
        topic_slug: `approval-sibling-${suffix}`,
      },
    )
    const committed = await approveTopicRecommendation(admin, WEB_PROVENANCE, sibling)
    await expect(getTopicByAny(committed.topic_id)).resolves.toMatchObject({
      id: committed.topic_id,
    })

    const rolledBack = await withPostgresTransactionForTest(query =>
      approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation, { query }),
    )

    expect(rolledBack.recommendation.topic_recommendation.status).toBe('approved')
    await expect(getTopicByAny(rolledBack.topic_id)).resolves.toBeNull()
    await expect(getPostByAny(recommendation.id)).resolves.toMatchObject({
      topic_recommendation: { status: 'pending' },
    })
  })
})
