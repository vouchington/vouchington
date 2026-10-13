import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, createTestRssFeedItemWithUrl } from '@voucha/test-helpers'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestBloomRepairSources } from '@voucha/test-helpers/entities/bloom-reconciliation'
import { ensureTestReconciliationBloomFilters } from '@voucha/test-helpers/bloom-repair-live-filters'
import { normalizeKey } from '@ts-shared/utils/strings'
import { repairEntityBloomKeys } from '@services/entity-cache/repair-entity-keys'
import { repairReconciledBloomKeys } from './bloom-repair.mts'
import type { EntityReconciliationCandidate } from './types.mts'

describe('current-state Bloom reconciliation repair', () => {
  it('restores source-owned lookup keys through every current-state repair route', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const fixture = await insertTestBloomRepairSources(user.id, post.id, Date.now())
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)
    const filters = await ensureTestReconciliationBloomFilters()
    const sources: Pick<EntityReconciliationCandidate, 'entityType' | 'entityId' | 'changeId'>[] = [
      { entityType: 'community', entityId: fixture.communityId },
      { entityType: 'rss_feed_item', entityId: item.id },
      { entityType: 'topic_alias', entityId: fixture.aliasId },
      { entityType: 'post_slug', entityId: post.id, changeId: fixture.slug },
      { entityType: 'api_key', entityId: fixture.apiKeyId },
      ...fixture.sourceIds.map(changeId => ({
        entityType: 'blocklisted_domain' as const,
        entityId: fixture.domain,
        changeId,
      })),
      { entityType: 'embedding', entityId: fixture.embeddingHash },
      { entityType: 'url_hostname', entityId: fixture.hostnameId },
    ]
    for (const source of sources)
      await repairReconciledBloomKeys({ ...source, changedAtEpochUs: '0' })
    await repairEntityBloomKeys('posts', post.id)
    expect(await filters.communities.exists(normalizeKey(fixture.communityId))).toBe(true)
    expect(await filters.communities.exists(normalizeKey(fixture.slug))).toBe(true)
    expect(await filters.rss_feed_items.exists(normalizeKey(item.id))).toBe(true)
    expect(await filters.topics.exists(normalizeKey(fixture.slug))).toBe(true)
    expect(await filters.posts.exists(normalizeKey(fixture.slug))).toBe(true)
    expect(await filters.posts.exists(normalizeKey(post.id))).toBe(true)
    expect(await filters.apiKeys.exists(fixture.embeddingHash)).toBe(true)
    expect(await filters.urls.exists(fixture.domain)).toBe(true)
    expect(await filters.emails.exists(fixture.domain)).toBe(true)
    expect(await filters.embedding.exists(fixture.embeddingHash)).toBe(true)
  })
})
