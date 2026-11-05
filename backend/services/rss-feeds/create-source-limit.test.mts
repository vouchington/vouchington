import '@services/bookmarks'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, getRssFeedFollowExistsForTest, WEB_PROVENANCE } from '@voucha/test-helpers'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { createSourceFromUrl } from './create-source.mts'

describe('source creation follow limit', () => {
  it('creates a source but skips following it when capacity is exhausted', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_rss_feed: 1 }))
    const user = await createTestUser()
    const existing = await insertTestRssFeedDirect({})
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'rss_feed',
    })
    await upsertEntityRelation(user, relation, user, [existing])
    const url = `https://feed-${crypto.randomUUID()}.example.com/rss.xml`
    const result = await createSourceFromUrl(user, WEB_PROVENANCE, url, {
      fetchAndClassifyFeedImpl: async () => ({
        kind: 'feed',
        title: 'Owned feed',
        feedType: 'article',
      }),
    })
    expect(result).toMatchObject({ status: 'created', follow_skipped: true })
    expect(await getRssFeedFollowExistsForTest(user.id, result.rss_feed_id)).toBe(false)
  })
})
