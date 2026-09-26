import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createTopicRecommendation, deletePendingRecommendation } from './index.mts'

describe('pending topic-recommendation publication capture', () => {
  it('durably records withdrawal before the recommendation disappears', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected recommendation author')
    const suffix = crypto.randomUUID()
    const recommendation = await createTopicRecommendation(WEB_PROVENANCE, user, {
      markdown: `Withdraw publication ${suffix}`,
      topic_title: `Withdraw publication ${suffix}`,
      topic_slug: `withdraw-publication-${suffix}`,
    })
    const before = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: recommendation.id,
    })

    await deletePendingRecommendation(user, recommendation)

    const after = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: recommendation.id,
    })
    expect(Number(after?.generation)).toBeGreaterThan(Number(before?.generation))
    expect(after?.reasons).toContain('post_deleted')
  })
})
