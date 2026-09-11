import {
  beginTransaction,
  addCategoryToRssFeedItem,
  countTestPostPublicationDirtyWorkForRssFeeds,
  countTestPostPublicationIdentityKeysForRssFeeds,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  listTestPostPublicationImpactTopicIds,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  lockPostPublicationRssFeedScopes,
  recordRssFeedDiscoverabilityChanges,
} from './capture-rss-feeds.mts'
import { recordPostPublicationChange } from './capture.mts'
import { claimPostPublicationDirtyWork, reconcilePostPublicationDirtyWork } from './public.mts'

describe('RSS-feed publication capture', () => {
  it('retains the feed owner and item-category topics for state reconciliation', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected RSS publication author fixture')
    const [ownerTopic, categoryTopic] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const rssFeedId = await createTestRssFeedWithTiming(ownerTopic.id)
    const item = await createTestRssFeedItemWithUrl(rssFeedId)
    await addCategoryToRssFeedItem(item.id, categoryTopic.id, `publication-${crypto.randomUUID()}`)

    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'rss_feed', rssFeedId },
      reason: 'rss_feed_enablement_changed',
    })
    await query.commit()

    await expect(listTestPostPublicationImpactTopicIds(work.id)).resolves.toEqual(
      expect.arrayContaining([ownerTopic.id, categoryTopic.id]),
    )

    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected RSS publication work lease')
    const result = await reconcilePostPublicationDirtyWork(claimed)
    expect(result.rssFeedItemIds).toContain(item.id)
  })

  it('retains only the RSS items explicitly changed by source ingestion', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected RSS source publication fixture')
    const topic = await createTestTopic({ user })
    const rssFeedId = await createTestRssFeedWithTiming(topic.id)
    const [changedItem, unchangedItem] = await Promise.all([
      createTestRssFeedItemWithUrl(rssFeedId),
      createTestRssFeedItemWithUrl(rssFeedId),
    ])
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'rss_feed', rssFeedId },
      reason: 'rss_feed_source_changed',
      impactedRssFeedItemIds: [changedItem.id],
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected RSS source work lease')

    const result = await reconcilePostPublicationDirtyWork(claimed)
    expect(result.rssFeedItemIds).toEqual([changedItem.id])
    expect(result.rssFeedItemIds).not.toContain(unchangedItem.id)
  })

  it('acquires scopes in bounded global UUID batches', async () => {
    const ids = Array.from({ length: 1_001 }, () => crypto.randomUUID())
    const expected = [...new Set(ids)].toSorted()
    const batches: string[][] = []
    const query = (async (_statement: string, values: unknown[]) => {
      batches.push(values[0] as string[])
      return { rows: [], rowCount: 0 }
    }) as unknown as TransactionQuery

    await lockPostPublicationRssFeedScopes(query, ids)

    expect(batches).toEqual([
      expected.slice(0, 500),
      expected.slice(500, 1_000),
      expected.slice(1_000),
    ])
  })

  it('captures large scope sets with one coalesced work row per feed', async () => {
    const rssFeedIds = Array.from({ length: 1_001 }, () => crypto.randomUUID())

    await using query = await beginTransaction()
    await recordRssFeedDiscoverabilityChanges(query, rssFeedIds)
    await query.commit()

    await expect(countTestPostPublicationDirtyWorkForRssFeeds(rssFeedIds)).resolves.toBe(
      rssFeedIds.length,
    )
    await expect(countTestPostPublicationIdentityKeysForRssFeeds(rssFeedIds)).resolves.toBe(
      rssFeedIds.length,
    )
  })
})
