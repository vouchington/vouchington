import { describe, expect, it } from 'vitest'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { WEB_PROVENANCE, createTestUser } from '@voucha/test-helpers'
import { ensureTestReconciliationBloomFilters } from '@voucha/test-helpers/bloom-repair-live-filters'
import { normalizeKey } from '@ts-shared/utils/strings'
import { entityCacheBloomFilters } from '@services/entity-cache/bloom-filter-instances'
import { getPostByAnyCached } from '@services/entity-fetch'
import { prepareTopicRecommendation } from './create-topic-recommendation.mts'

describe('prepared topic recommendation Bloom admission', () => {
  it('publishes ID and slug before finalize resolves', async () => {
    await ensureTestReconciliationBloomFilters()
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create recommendation author')
    const random = Math.random().toString(36).slice(2, 10)
    const prepared = await withCommittedPostgresTransactionForTest(query =>
      prepareTopicRecommendation(
        user,
        WEB_PROVENANCE,
        {
          markdown: `Prepared recommendation ${random}`,
          topic_title: `Prepared Topic ${random}`,
          topic_slug: `prepared-topic-${Date.now()}-${random}`,
        },
        { query },
      ),
    )

    await prepared.finalize()
    const { id, slug } = prepared.response
    expect(slug).toBeTruthy()
    expect(await entityCacheBloomFilters.posts.exists(normalizeKey(id))).toBe(true)
    expect(await entityCacheBloomFilters.posts.exists(normalizeKey(slug!))).toBe(true)
    expect((await getPostByAnyCached(slug!))?.id).toBe(id)
  })
})
